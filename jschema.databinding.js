(function() {
/**
 * Data Binding
 *
 * Implements the following events:
 * - 'change'
 *		Fired once when updated
 *		Recieves the Binding instance as a parameter
 * - 'change:<PROPERTYNAME>'
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
 * @depends		jQuery 1.7.1	http://jquery.com
 * @depends		JSV				https://github.com/garycourt/JSV
 * @depends		json2.js		https://github.com/douglascrockford/JSON-js, required for older browsers only
 * @author		pospi	<pospi@spadgos.com>
 */
	JSchema.Binding = function(attrs, schema, options)
	{
		this.schema = schema;

		// read options
		this.idField = options.idField || 'id';

		// set initial attributes
		this.set(attrs);
	};

	/**
	 * Recursively extends an object's prototype with the object passed in.
	 * This acts similarly to jQuery's extend(), except that explicitly
	 * set 'undefined' values have the effect of unsetting values in the
	 * original object.
	 */
	JSchema.extendAndUnset = function()
	{
		var options, name, src, copy, copyIsArray, clone,
			target = arguments[0] || {},
			i = 1,
			length = arguments.length;

		// Handle case when target is a string or something (possible in deep copy)
		if ( typeof target !== "object" && !$.isFunction(target) ) {	/* LIBCOMPAT */
			target = {};
		}

		for ( ; i < length; i++ ) {
			// Only deal with non-null/undefined values
			if ( (options = arguments[ i ]) != null ) {
				// Extend the base object
				for ( name in options ) {
					src = target[ name ];
					copy = options[ name ];

					// Prevent never-ending loop
					if ( target === copy ) {
						continue;
					}

					// Recurse if we're merging plain objects or arrays
					if ( copy && ( $.isPlainObject(copy) || (copyIsArray = $.isArray(copy)) ) ) {	/* LIBCOMPAT */
						if ( copyIsArray ) {
							copyIsArray = false;
							clone = src && $.isArray(src) ? src : [];	/* LIBCOMPAT */
						} else {
							clone = src && $.isPlainObject(src) ? src : {};	/* LIBCOMPAT */
						}

						// Never move original objects, clone them
						target[ name ] = JSchema.extendAndUnset( clone, copy );
					} else {
						target[ name ] = copy;
					}
				}
			}
		}

		// Return the modified object
		return target;
	};

	JSchema.extendAndUnset(JSchema.Binding.prototype, {

		attributes : {},			// our properties
		_previousAttributes : null,	// A snapshot of the model's previous attributes, taken immediately after the last "change" event was fired.
		_dirty : false,				// true if object is dirty (needs to be pushed to server)
		_changing : false,			// true when changing (prevents callbacks being recursively fired)

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
			return this.attributes[attr] != null;
		},

		// Get the value of an attribute
		get : function(attr)
		{
			return this.attributes[attr];
		},

		// Return a copy of our attributes
		getAttributes : function()
		{
			return JSchema.extendAndUnset({}, this.attributes);
		},

		//======= Saved / previous state ========

		// Determine if the model has changed since the last "change" event.
		// If an attribute name is passed, determine if that attribute has changed.
		hasChanged : function(attr)
		{
			if (attr) {
				return this._previousAttributes[attr] != this.attributes[attr];
			}
			return this._dirty;
		},

		// Get the previous value of an attribute, recorded at the time of the last data change
		getPrevious : function(attr)
		{
			if (!attr || !this._previousAttributes) return null;
			return this._previousAttributes[attr];
		},

		/**
		 * Return an object containing all the attributes that have changed, or false
		 * if there are no changed attributes. Useful for determining what parts of a
		 * view need to be updated and/or what attributes need to be persisted to
		 * the server.
		 *
		 * @param	object	now		if passed, only the attributes specified will be checked for changes
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
		 *
		 * :WARNING: passing 'undefined' as a value to this method will not clear the property,
		 *			 you must always use NULL for this purpose!
		 */
		set : function(attrs, suppressEvent)
		{
			if (!attrs) {
				return this;
			}
			var now = this.attributes;

			if (!this.validate(attrs)) {
				return false;
			}

			// Flag that change events are being fired
			var alreadyChanging = this._changing;
			this._changing = true;

			this._previousAttributes = this.getAttributes();

			// Update attributes
			for (var attr in attrs) {
				var val = attrs[attr];
				if (!this._isEqual(now[attr], val)) {
					now[attr] = val;
					this._dirty = true;
					if (!suppressEvent) {
						this.fireEvent('change:' + attr, this, val, attr);	// notify that this attribute has changed
					}
				}
			}

			// Fire the "change" event if the model has been changed
			if (!alreadyChanging && !suppressEvent && this._dirty) {
				this.change();
			}

			this._changing = false;
			return this;
		},

		// Remove an attribute from the model, firing a "change" event
		unset : function(attr, suppressEvent)
		{
			if (!(attr in this.attributes)) return this;
			var value = this.attributes[attr];

			// Create a hash with the attribute set to undefined to validate with
			var unsetHash = {};
			unsetHash[attr] = undefined;
			if (!this.validate(unsetHash)) {
				return false;
			}

			// Flag that change events are being fired
			var alreadyChanging = this._changing;
			this._changing = true;

			this._previousAttributes = this.getAttributes();

			// Remove the attribute
			delete this.attributes[attr];
			this._dirty = true;

			// Fire "change" events if desired
			if (!alreadyChanging && !suppressEvent) {
				this.fireEvent('change:' + attr, this, undefined, attr);	// fire a change event for the attribute removed
				this.change();
			}

			this._changing = false;
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

			// Flag that change events are being fired
			var alreadyChanging = this._changing;
			this._changing = true;

			this._previousAttributes = this.getAttributes();
			this.attributes = {};
			this._dirty = true;

			if (!alreadyChanging && !suppressEvent) {
				for (attr in old) {
					this.fireEvent('change:' + attr, this, undefined, attr);	// fire change events for all removed attributes
				}
				this.change();
			}

			this._changing = false;
			return this;
		},

		//=============================================================================================
		//	Misc

		// Create a new model with identical attributes and validation to this one
		clone : function()
		{
			return new this.constructor(this.attributes, this.schema);
		},

		// Call this method to manually fire a 'change' event
		// Calling this will cause all callbacks listening to the data to run
		change : function(options)
		{
			this.fireEvent('change', this);
			this._dirty = false;
		},

		//=============================================================================================
		//	Internals

		/**
		 * Converts a serverside response into the hash of attributes to be set on
		 * the model. The default implementation is to decode the response as JSON
		 * and pass it along.
		 *
		 * :TODO: allow overriding this method for new models in Binding.Create()
		 */
		parse : function(resp, xhr)
		{
			return JSON.decode(resp);
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

		_isEqual : function(a, b) 		// mostly taken from Underscore.js isEqual()
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
		var ctor = function(attrs) {
			JSchema.Binding.call(this, attrs, schema, options);
		};
		JSchema.extendAndUnset(ctor.prototype, JSchema.Binding.prototype);

		return ctor;
	};

}).call(this, jQuery);
