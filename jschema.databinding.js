(function() {
/**
 * Data Binding
 *
 * Implements the following events:
 * - 'change'
 *		Fired once when updated
 *		Recieves the Binding instance as a parameter
 * - 'change.update.<PROPERTYNAME>',
 *   'change.create.<PROPERTYNAME>' and
 *   'change.delete.<PROPERTYNAME>'
 *		Fired due to changes of particular attributes
 *		Recieves the instance, attribute value and attribute name as parameters
 * - 'error'
 *		Fired when the data attempts to be updated but fails validation. Recieves an
 *		array of error description objects and the Binding instance as parameters.
 *		If no error callbacks are set, this gets thrown as a general Error object
 *		containing the errors array from JSV as its 'schemaErrors' property.
 *
 * @package		JSchema.Binding
 * @depends		JSchema.EventHandler
 * @depends		jQuery 1.7.1	http://jquery.com					// LIBCOMPAT
 * @depends		JSV				https://github.com/garycourt/JSV
 * @depends		json2.js		https://github.com/douglascrockford/JSON-js, required for older browsers only
 * @author		pospi	<pospi@spadgos.com>
 */

 	/**
 	 * Creates a new JSchema.Binding instance, aka a data record, aka object instance
 	 *
 	 * @param object attrs   initial attributes for this data record
 	 * @param object schema  JSON schema document for validation, as a javascript object
 	 * @param object options options for this validator:
	 *                     - idField: 			key name of the object's attributes to use to
	 *                     						determine record uniqueness. Defaults to 'id'.
	 *                     - doCreateEvents:	if false, don't fire any events while constructing this
	 *                     						object. Defaults to false.
 	 */
	JSchema.Binding = function(attrs, schema, options)
	{
		this.schema = schema;

		// read options
		this.options = options;
		this.idField = options.idField || 'id';

		// set initial attributes
		this.set(attrs, !options.doCreateEvents);
	};

	JSchema.extendAndUnset(JSchema.Binding.prototype, {

		attributes : {},			// our properties
		_previousAttributes : null,	// A snapshot of the model's previous attributes, taken immediately after the last "change" event was fired.
		_dirty : false,				// true if object is dirty (needs to be pushed to server)

		//=============================================================================================
		//	Accessors

		//======= Current state ========

		// A model is new if it lacks an id
		isNew : function()
		{
			return this.attributes[this.idField] !== undefined
				&& this.attributes[this.idField] !== null
				&& this.attributes[this.idField] != false
				&& !isNaN(this.attributes[this.idField]);
		},

		// Determine whether we have an attribute
		has : function(attr)
		{
			return JSchema.dotSearchObject(this.attributes, attr) != null;
		},

		// Get the value of an attribute.
		// Accepts dot notation for accessing subproperties.
		// Returns undefined if the attribute is not found.
		get : function(attr)
		{
			return JSchema.dotSearchObject(this.attributes, attr);
		},

		// Return a copy of our attributes
		getAttributes : function()
		{
			return JSchema.extendAndUnset({}, this.attributes);
		},

		//======= Saved / previous state ========

		/**
		 * Determine if the model has changed since the last "change" event.
		 * If an attribute name is passed, determine if that attribute has changed.
		 */
		hasChanged : function(attr)
		{
			if (attr) {
				return JSchema.dotSearchObject(this._previousAttributes, attr) != JSchema.dotSearchObject(this.attributes, attr);
			}
			return this._dirty;
		},

		/**
		 * Flag the record as non-dirty again after some changes. You would usually
		 * do this in response to a successful AJAX storing of the data within it.
		 */
		changesPropagated : function()
		{
			this._dirty = false;
		},

		// Get the previous value of an attribute, recorded at the time of the last data change
		getPrevious : function(attr)
		{
			if (!attr || !this._previousAttributes) return null;
			return JSchema.dotSearchObject(this._previousAttributes, attr);
		},

		/**
		 * Return an object containing all the attributes that have changed, or false
		 * if there are no changed attributes. Useful for determining what parts of a
		 * view need to be updated and/or what attributes need to be persisted to
		 * the server.
		 *
		 * @param	object	now		if passed, only the attributes specified will be checked for changes
		 *
		 * :TODO: return only subproperties changed instead of only recursing top-level
		 */
		getChangedAttributes : function(now)
		{
			now || (now = this.attributes);
			var old = this._previousAttributes;
			var changed = false;
			for (var attr in now) {
				if (!this._isEqual(old[attr], now[attr])) {
					changed = changed || {};
					changed[attr] = now[attr];
				}
			}
			return changed;
		},

		// Get all of the attributes of the model at the time it was last modified
		getPreviousAttributes : function()
		{
			return JSchema.extendAndUnset({}, this._previousAttributes);
		},

		//=============================================================================================
		//	Mutators

		/**
		 * Set a hash of model attributes on the object, firing a "change" event
		 * @param  {mixed} attrs  May either be a string or an object. This causes the operation
		 *                        to act in one of two ways:
		 *                        (object) Merges this object's values in with the record's.
		 *                        		param1 is a boolean controlling whether or not to suppress event firing
		 *                        (string) Sets the attribute at this index (specified by dot notation).
		 *                        		param1 is the value to set
		 *                        		param2 is a boolean controlling whether or not to suppress event firing
		 */
		set : function(attrs, param1, param2)
		{
			if (!attrs) {
				return this;
			}

			// check for dot notation property setting
			if (typeof attrs == 'string') {
				return this._setByIndex(attrs, param1, param2);
			}

			var now = this.attributes,
				suppressEvent = param1,
				changes = false;

			if (!this.validate(attrs)) {
				return false;
			}

			this._previousAttributes = this.getAttributes();

			this.holdEvents();

			// Update attributes
			for (var attr in attrs) {
				var val = attrs[attr];
				if ( (jQuery.isPlainObject(now[attr]) && jQuery.isPlainObject(val))
				  || (jQuery.isArray(now[attr]) && jQuery.isArray(val)) ) {			// object merging & array modification
					var result = this._handleObjectChange(attr, now[attr], val, suppressEvent);
					now[attr] = result[0];
					if (result[1]) {
						changes = true;
						this._dirty = true;
					}
				} else if (!this._isEqual(now[attr], val)) {						// scalar property setting
					var oldVal = now[attr];
					now[attr] = val;
					changes = true;
					this._dirty = true;
					if (!suppressEvent) {
						this._propertyChange(attr, (val === undefined ? 'delete' : 'update'), oldVal, val, attr);
					}
				}
			}

			if (changes && !suppressEvent) {
				// Fire the "change" event if the model has been changed
				this.change();
				this.fireHeldEvents();
			} else {
				this.abortHeldEvents();
			}

			return this;
		},

		// Set a data attribute by dot notation index
		_setByIndex : function(attr, newVal, suppressEvent)
		{
			// Create an object with the previous attribute set to modify and validate with
			var tempAttrs = this.getAttributes();

			// Search temporary object for the property to remove
			var searchResult = JSchema.dotSearchObject(tempAttrs, attr, true);
			if (typeof searchResult[0] == 'undefined') return this;	// property wasn't set

			var parent = searchResult[0],
				value = parent[searchResult[1]],
				path = searchResult[2],
				tempPath;

			// set the property and check the new attributes for errors
			parent[searchResult[1]] = newVal;
			if (!this.validate(tempAttrs)) {
				// if the new attributes don't pass validation, abort. No need to return
				// a failure case since an error callback is mandatory.
				return this;
			}

			// copy over our current attributes to the previous
			this._previousAttributes = this.getAttributes();
			this.attributes = tempAttrs;

			// fire events for all changes
			if (!suppressEvent) {
				this.holdEvents();

				// fire update for the actual property affected
				path = path.split('.');
				tempPath = path.join('.');
				this._propertyChange(tempPath, 'update', this.getPrevious(tempPath), newVal, tempPath);
				path.pop();

				// fire updates for all parent properties
				while (path.length) {
					tempPath = path.join('.');
					this._propertyChange(tempPath, 'update', this.getPrevious(tempPath), this.get(tempPath), tempPath);
					path.pop();
				}

				this.fireHeldEvents();
			}

			return this;
		},

		// Remove an attribute from the model, firing a "change" event
		unset : function(attr, suppressEvent)
		{
			// Create an object with the previous attribute set to modify and validate with
			var tempAttrs = this.getAttributes();

			// Search temporary object for the property to remove
			var searchResult = JSchema.dotSearchObject(tempAttrs, attr, true);
			if (typeof searchResult[0] == 'undefined') return this;	// property wasn't set

			var parent = searchResult[0],
				value = parent[searchResult[1]],
				path = searchResult[2],
				tempPath;

			// remove the property from the original temp object by reference
			delete parent[searchResult[1]];
			if (!this.validate(tempAttrs)) {
				// if the new attributes don't pass validation, abort. No need to return
				// a failure case since an error callback is mandatory.
				return this;
			}

			// copy over our current attributes to the previous
			this._previousAttributes = this.getAttributes();
			this.attributes = tempAttrs;

			// fire events for all changes
			if (!suppressEvent) {
				this.holdEvents();

				// fire deletion for the actual property affected
				path = path.split('.');
				tempPath = path.join('.');
				this._propertyChange(tempPath, 'delete', value, undefined, tempPath);
				path.pop();

				// fire updates for all parent properties
				while (path.length) {
					tempPath = path.join('.');
					this._propertyChange(tempPath, 'update', this.getPrevious(tempPath), this.get(tempPath), tempPath);
					path.pop();
				}

				this.fireHeldEvents();
			}

			return this;
		},

		// Clear all attributes on the model, firing "change" unless you choose to silence it
		clear : function(suppressEvent)
		{
			var attr;
			var old = this.attributes;

			// Create a hash with all attributes set to undefined to validate with
			var validObj = {};
			for (attr in old) {
				validObj[attr] = undefined;
			}
			if (!this.validate(validObj)) {
				return false;
			}

			// update data
			this._previousAttributes = this.getAttributes();
			this.attributes = {};
			this._dirty = true;

			// run change events
			if (!suppressEvent) {
				this.holdEvents();

				for (attr in old) {
					this._propertyChange(attr, 'delete', old[attr], undefined, attr);	// fire change events for all removed attributes
				}
				this.change();

				this.fireHeldEvents();
			}

			return this;
		},

		/**
		 * Array helper for appending elements to an array property
		 *
		 * @throws	an error if target variable is not an array
		 */
		push : function(attr, val, suppressEvent)
		{
			// Create an object with the previous attribute set to modify and validate with
			var tempAttrs = this.getAttributes();

			// Search temporary object for the property to remove
			var searchResult = JSchema.dotSearchObject(tempAttrs, attr, true);
			if (typeof searchResult[0] == 'undefined') return this;	// property wasn't set

			var parent = searchResult[0],
				value = parent[searchResult[1]],
				path = searchResult[2],
				tempPath;

			// append to the target array, assuming it is one. If not, an error will be thrown.
			value.push(val);
			if (!this.validate(tempAttrs)) {
				// if the new attributes don't pass validation, abort. No need to return
				// a failure case since an error callback is mandatory.
				return this;
			}

			// copy over our current attributes to the previous
			this._previousAttributes = this.getAttributes();
			this.attributes = tempAttrs;

			// fire events for all changes
			if (!suppressEvent) {
				this.holdEvents();

				// fire creation for the actual array index affected
				tempPath = path + '.' + (value.length - 1);
				this._propertyChange(tempPath, 'create', undefined, val, tempPath);

				// fire updates for all parent properties
				path = path.split('.');
				while (path.length) {
					tempPath = path.join('.');
					this._propertyChange(tempPath, 'update', this.getPrevious(tempPath), this.get(tempPath), tempPath);
					path.pop();
				}

				this.fireHeldEvents();
			}

			return this;
		},

		//=============================================================================================
		//	Misc

		// Create a new model with identical attributes and validation to this one
		clone : function(cloneEvents)
		{
			var obj = new this.constructor(this.attributes, this.schema, this.options);

			if (cloneEvents) {
				obj._callbacks = this._callbacks.splice(0);
			}

			return obj;
		},

		// Call this method to manually fire a 'change' event
		// Calling this will cause all callbacks listening to the record to run
		change : function(options)
		{
			this.fireEvent('change', this);
		},

		//=============================================================================================
		//	Internals

		/**
		 * Fire a change event for one of the record's properties changing
		 * @param  {string} propertyString name of the property changed (dot notation)
		 * @param  {string} changeAction	subevent of the change event (create, update or delete)
		 * @param  {mixed} oldValue		value of the attribute before the change
		 * @param  {mixed} newValue		new value of the attribute currently in the object
		 * @param  {string} attrIndex	the dot-delimited record index of the property being changed
		 */
		_propertyChange : function(propertyString, changeAction, oldValue, newValue, attrIndex)
		{
			var eventName = 'change.' + changeAction + '.' + propertyString;
			this.fireEvent(eventName, this, oldValue, newValue, attrIndex, eventName);
		},

		/**
		 * Run schema validation against a set of incoming attributes, returning true
		 * if all is well. If any errors are found, the error result object of the JSON schema
		 * validator is sent to any error callbacks registered.
		 */
		validate : function(attrs)
		{
			attrs = JSchema.extendAndUnset(this.getAttributes(), attrs);

			var r = JSchema.Validator.validate(attrs, this.schema);
			if (r.errors.length) {
				if (!this.fireEvent('error', this, r.errors)) {
					// no error callbacks registered
					var e = new Error("Error updating Data Binding - new attributes did not pass validation:\n" + JSON.stringify(r.errors, undefined, "\t"));
					e.schemaErrors = r.errors;
					throw e;
				}
				return false;
			}
			return true;
		},

		/**
		 * Handles merging of record subobjects & firing of appropriate change events
		 *
		 * @param	String	eventStr	Event to fire. Starts as 'change:' + the base attribute name.
		 *                        		Subsequent recursions into the object will fire events appended
		 *                        		with '.' + the subattribute name.
		 * @return	2-length array of the merged object, and a boolean indicating whether subproperties were modified.
		 */
		_handleObjectChange : function(eventStr, oldObject, newObject, suppressEvent)
		{
			var childrenChanged = false;

			// if the existing object was an array, we wil need to check its length after updating
			var previousIsArray = jQuery.isArray(oldObject);	/* LIBCOMPAT */

			// store a copy of the object prior to modification so that we can return the old one in a change event
			var previousObject = {};
			if (!suppressEvent) {
				if (previousIsArray) {
					previousObject = [];
				}
				JSchema.extendAndUnset(previousObject, oldObject);
			}

			for ( name in newObject ) {
				src = oldObject[ name ];
				copy = newObject[ name ];

				// Prevent never-ending loop
				if ( oldObject === copy ) {
					continue;
				}

				// make a new string to fire an event for this child changing
				var newEventStr = eventStr + '.' + name;

				// Recurse if we're merging plain objects or arrays
				if ( copy && ( jQuery.isPlainObject(copy) || (copyIsArray = jQuery.isArray(copy)) ) ) {	/* LIBCOMPAT */
					if ( copyIsArray ) {
						copyIsArray = false;
						clone = src && jQuery.isArray(src) ? src : [];	/* LIBCOMPAT */
					} else {
						clone = src && jQuery.isPlainObject(src) ? src : {};	/* LIBCOMPAT */
					}

					var results = JSchema._handleObjectChange(newEventStr, clone, copy, suppressEvent);

					oldObject[ name ] = results[0];
					childrenChanged = true;			// tell our parent to fire modified, too

					// if children were modified, fire a change event for us too!
					if (results[1] && !suppressEvent) {
						this._propertyChange(newEventStr, 'update', src, oldObject[name], newEventStr);
					}
				} else if (src != copy) {
					oldObject[ name ] = copy;
					childrenChanged = true;	// tell our parent to fire modified, too

					// fire a change event for the modified property
					if (!suppressEvent) {
						this._propertyChange(newEventStr, (copy === undefined ? 'delete' : 'update'), src, copy, newEventStr);
					}
				}
			}

			// unset array elements removed by a change
			if (previousIsArray && previousObject.length > newObject.length) {
				// pop off all the removed elements
				oldObject = oldObject.slice(0, newObject.length);
				// fire any callbacks needed
				var i = newObject.length;
				if (!suppressEvent) {
					while (i < previousObject.length) {
						this._propertyChange(eventStr + '.' + i, 'delete', previousObject[i], undefined, eventStr + '.' + i);
						++i;
					}
				}
				childrenChanged = true;
			}

			// fire a change event for ourselves when bubbling back up
			if (childrenChanged && !suppressEvent) {
				this._propertyChange(eventStr, 'update', previousObject, oldObject, eventStr);
			}

			return [oldObject, childrenChanged];
		},

		// mostly taken from Underscore.js isEqual()
		_isEqual : function(a, b)
		{
			// Check object identity.
			if (a === b) return true;
			// Different types?
			var atype = typeof(a), btype = typeof(b);
			if (atype != btype) return false;
			// Basic equality test (watch out for coercions).
			if (a == b) return true;
			// One is falsy and the other truthy.
			if ((!a && b) || (a && !b)) return false;
			// Check dates' integer values.
			if (atype == 'date' && bType == 'date') {
				return a.getTime() === b.getTime();
			}
			// Compare regular expressions.
			if (atype == 'regexp' && bType == 'regexp') {
				return a.source === b.source &&
						a.global     === b.global &&
						a.ignoreCase === b.ignoreCase &&
						a.multiline  === b.multiline;
			}
			// If a is not an object by this point, we can't handle it.
			if (atype !== 'object') return false;
			// Check for different array lengths before comparing contents.
			if (a.length && (a.length !== b.length)) return false;
			// Nothing else worked, deep compare the contents.
			var aKeys = this._getObjectKeys(a), bKeys = this._getObjectKeys(b);
			// Different object sizes?
			if (aKeys.length != bKeys.length) {
				return false;
			}
			// Recursive comparison of contents.
			for (var i = 0; i < aKeys.length; ++i) {
				var key = aKeys[i];
				if (!(key in b) || !this._isEqual(a[key], b[key])) {
					return false;
				}
			}
			return true;
		},

		_getObjectKeys : function(obj)
		{
			var fn = Object.keys || function(obj) {
				if (obj !== Object(obj)) throw new TypeError('Invalid object');
				var keys = [];
				for (var key in obj) if (hasOwnProperty.call(obj, key)) keys[keys.length] = key;
				return keys;
			};
			return fn(obj);
		}

	}, JSchema.EventHandler);

	//=============================================================================================
	// Static methods

	// Creates a Binding subclass with the desired validation schema and options
	JSchema.Binding.Create = function(schema, options)
	{
		options = options || {};
		var ctor = function(attrs, instanceOpts) {
			JSchema.Binding.call(this, attrs, schema, instanceOpts || options);
		};

		// add methods
		JSchema.extendAndUnset(ctor.prototype, JSchema.Binding.prototype);

		// add some alias methods
		ctor.prototype.getAll = ctor.prototype.getAttributes;

		return ctor;
	};

}).call(this, jQuery);
