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
 *                     - clearIdOnClone:	if true, records cloned from others can automatically have their
 *                     						ID fields cleared. Defaults to false.
 */
JSchema.Binding = function(attrs, schema, options)
{
	this.schema = schema;

	// read options
	this.options = {};
	this.options.idField		= options.idField || 'id';
	this.options.doCreateEvents	= options.doCreateEvents || false;
	this.options.clearIdOnClone	= options.clearIdOnClone === false ? false : true;

	// set initial attributes
	this.set(attrs, !options.doCreateEvents, undefined, true);
};

JSchema.extendAndUnset(JSchema.Binding.prototype, {

	attributes : {},			// our properties
	_previousAttributes : null,	// A snapshot of the record's previous attributes, taken immediately after the last "change" event was fired.
	_savedStates : {},			// various snapshots of the record data saved into buckets. This allows for history actions and state saving.
	_dirty : false,				// true if object is dirty (needs to be pushed to server)
	_validating : true,			// true if object should perform validation when updating data

	//=============================================================================================
	//	Accessors

	//======= Object querying (class methods) ========

	getRecordById : function(id)
	{
		return this.instances[id] || null;
	},

	getInstanceCount : function(includeUnsaved)
	{
		var count = 0, instance;
		for (var i in this.instances) {
			if (this.instances.hasOwnProperty(i)) {
				count++;
			}
		}
		if (includeUnsaved) {
			count += this.newInstances.length;
		}
		return count;
	},

	getAllInstances : function(includeUnsaved)
	{
		var instances = JSchema.extendAndUnset({}, this.instances),
			newInstanceCount = 0;

		if (includeUnsaved) {
			// count instances
			for (var i = 0, l = this.newInstances.length; i < l; ++i) {
				instances['new#' + newInstanceCount] = this.newInstances[i];
				newInstanceCount++;
			}
		}
		return instances;
	},

	//======= Current state ========

	// A model is new if it lacks an id
	isNew : function()
	{
		return this.getId() == null;
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

	// get the record ID. only works when idField option is provided
	getId : function()
	{
		return this.get(this.options.idField) || null;
	},

	// Return a copy of our attributes
	getAttributes : function()
	{
		return JSchema.extendAndUnset({}, this.attributes);
	},

	//======== Replication handling =========

	isDirty : function()
	{
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

	//======= Saved / previous state ========

	/**
	 * Determine if the model has changed since the last "change" event.
	 * If an attribute name is passed, determine if that attribute has changed.
	 * If 'since' is passed, the state of the object at the time of that saved
	 * state will be queried instead - check the whole object with (null, 'someTime').
	 * If there is no previous state found, NULL is returned instead.
	 */
	hasChanged : function(attr, since)
	{
		var changeTarget = this.getPreviousAttributes(since);
		if (!changeTarget) {
			return null;
		}
		if (attr) {
			return JSchema.dotSearchObject(changeTarget, attr) != JSchema.dotSearchObject(this.attributes, attr);
		}
		return JSchema.isEqual(this.attributes, changeTarget);
	},

	/**
	 * Return an object containing all the attributes that have changed, or false
	 * if there are no changed attributes. Useful for determining what parts of a
	 * view need to be updated and/or what attributes need to be persisted to
	 * the server.
	 *
	 * @param	bool	includePrevValue	if true, each element will be returned as an array of [oldValue, newValue]
	 * @param	object/array	old			if passed, will be used as the set of old attributes to check against. If ommitted, previous attributes are used.
	 * @param	object/array	now			if passed, only the attributes specified will be checked for changes. If ommitted, current attributes are used.
	 * @return recursive object of changes if changes have been made, false otherwise
	 */
	getChangedAttributes : function(includePrevValue, old, now)
	{
		now || (now = this.attributes);
		old || (old = this._previousAttributes);
		var changes,
			changed = false;
		for (var attr in now) {
			if ( (jQuery.isPlainObject(now[attr]) && jQuery.isPlainObject(old[attr]))	/* LIBCOMPAT */
			  || (jQuery.isArray(now[attr]) && jQuery.isArray(old[attr])) ) {			/* LIBCOMPAT */
			  	changes = this.getChangedAttributes(includePrevValue, old[attr], now[attr]);
			  	if (changes) {
			  		changed || (changed = {});
			  		changed[attr] = changes;
			  	}
			} else if (!JSchema.isEqual(old[attr], now[attr])) {
				changed || (changed = {});
				changed[attr] = includePrevValue ? [old[attr], now[attr]] : now[attr];
			}
		}
		return changed;
	},

	/**
	 * Get the previous value of an attribute, recorded at the time of the last data change or a
	 * particular saved state
	 * @param  {string} attr  attribute to retrive
	 * @param  {string} since (optional) saved record state to query
	 * @return {mixed}
	 */
	getPrevious : function(attr, since)
	{
		var changeTarget = this.getPreviousAttributes(since);
		if (!attr || !changeTarget) return null;
		return JSchema.dotSearchObject(this._previousAttributes, attr);
	},

	/**
	 * Get all of the attributes of the model at the time it was last modified
	 * or at a particular saved point in time
	 * @param  {string} stateName (optional) if passed, this saved state will be returned
	 * @return object of attributes, or NULL if there was no previous state found
	 */
	getPreviousAttributes : function(stateName)
	{
		if (!stateName && !this._previousAttributes) {
			return null;
		}
		if (stateName && !this._savedStates[stateName]) {
			return null;
		}
		return JSchema.extendAndUnset({}, stateName ? this._savedStates[stateName] : this._previousAttributes);
	},

	/**
	 * Save (or update) the current attributes of the record into a temporary
	 * cache for retrieval, reversion or change checking later.
	 * @param  {string} key the name the current state of the record will be saved under
	 */
	saveState : function(key)
	{
		this._savedStates[key] = this.getAttributes();
	},

	/**
	 * Erase a record state previously saved with saveState()
	 * @param  {string} key name of the state to save. This can be used with change checking functions.
	 */
	eraseState : function(key)
	{
		delete this._savedStates[key];
	},

	/**
	 * Reverts a record to one of its previously saved states. Note that this does not
	 * remove the state or perform any kind of stack operations, all prior saved states
	 * will persist.
	 * @param  {string} key name of the saved state to revert to
	 * @return {bool} true on success
	 */
	revertToState : function(key)
	{
		if (!this._savedStates[key]) {
			return false;
		}
		this.attributes = JSchema.extendAndUnset({}, this._savedStates[key]);
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
	 * @param bool isCreating  (optional) if true, fire create events instead of updates
	 */
	set : function(attrs, param1, param2, isCreating)
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
			if ( (jQuery.isPlainObject(now[attr]) && jQuery.isPlainObject(val))	/* LIBCOMPAT */
			  || (jQuery.isArray(now[attr]) && jQuery.isArray(val)) ) {			// object merging & array modification (LIBCOMPAT)
				var result = this._handleObjectChange(attr, now[attr], val, suppressEvent, isCreating);
				now[attr] = result[0];
				if (result[1]) {
					changes = true;
					this._dirty = true;
				}
			} else if (!JSchema.isEqual(now[attr], val)) {						// scalar property setting
				var oldVal = now[attr];
				now[attr] = val;
				changes = true;
				this._dirty = true;
				if (!suppressEvent) {
					this._propertyChange(attr, isCreating, oldVal, val, attr);
				}
			}
		}

		if (changes && !suppressEvent) {
			// fire a general update event
			this.fireEvent((isCreating ? 'change.create' : 'change.update'), this, this.getPreviousAttributes());
			// Fire the "change" event if the model has been changed
			this.change();
			this.fireHeldEvents();
		} else {
			this.abortHeldEvents();
		}

		return this;
	},

	// set the record ID. only works when idField option is provided
	setId : function(val)
	{
		return this.set(this.options.idField, val);
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
			this._propertyChange(tempPath, false, this.getPrevious(tempPath), newVal, tempPath);
			path.pop();

			// fire updates for all parent properties
			while (path.length) {
				tempPath = path.join('.');
				this._propertyChange(tempPath, false, this.getPrevious(tempPath), this.get(tempPath), tempPath);
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
		this._dirty = true;

		// fire events for all changes
		if (!suppressEvent) {
			this.holdEvents();

			// fire deletion for the actual property affected
			path = path.split('.');
			tempPath = path.join('.');
			this._propertyChange(tempPath, false, value, undefined, tempPath);
			path.pop();

			// fire updates for all parent properties
			while (path.length) {
				tempPath = path.join('.');
				this._propertyChange(tempPath, false, this.getPrevious(tempPath), this.get(tempPath), tempPath);
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
				this._propertyChange(attr, false, old[attr], undefined, attr);	// fire change events for all removed attributes
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
	 * @return the new array key added (length - 1) or FALSE if it doesn't exist
	 */
	push : function(attr, val, suppressEvent)
	{
		// Create an object with the previous attribute set to modify and validate with
		var tempAttrs = this.getAttributes();

		// Search temporary object for the property to remove
		var searchResult = JSchema.dotSearchObject(tempAttrs, attr, true);
		if (typeof searchResult[0] == 'undefined') return false;	// property wasn't set

		var parent = searchResult[0],
			value = parent[searchResult[1]],
			path = searchResult[2],
			newLen = value.length,
			tempPath;

		// append to the target array, assuming it is one. If not, an error will be thrown.
		value.push(val);
		if (!this.validate(tempAttrs)) {
			// if the new attributes don't pass validation, abort. No need to return
			// a failure case since an error callback is mandatory.
			return false;
		}

		// copy over our current attributes to the previous
		this._previousAttributes = this.getAttributes();
		this.attributes = tempAttrs;
		this._dirty = true;

		// fire events for all changes
		if (!suppressEvent) {
			this.holdEvents();

			// fire creation for the actual array index affected
			tempPath = path + '.' + (value.length - 1);
			this._propertyChange(tempPath, false, undefined, val, tempPath);

			// fire updates for all parent properties
			path = path.split('.');
			while (path.length) {
				tempPath = path.join('.');
				this._propertyChange(tempPath, false, this.getPrevious(tempPath), this.get(tempPath), tempPath);
				path.pop();
			}

			this.fireHeldEvents();
		}

		return newLen;
	},

	/**
	 * Array helper for removing elements from an array property
	 *
	 * @throws	an error if target variable is not an array
	 * @return the new length of the array after removal or FALSE if the property doesn't exist
	 */
	pop : function(attr, suppressEvent)
	{
		// Create an object with the previous attribute set to modify and validate with
		var tempAttrs = this.getAttributes();

		// Search temporary object for the property to remove
		var searchResult = JSchema.dotSearchObject(tempAttrs, attr, true);
		if (typeof searchResult[0] == 'undefined') return false;	// property wasn't set

		var parent = searchResult[0],
			value = parent[searchResult[1]],
			path = searchResult[2],
			newLen = value.length - 1,
			tempPath;

		// pop from the target array, assuming it is one. If not, an error will be thrown.
		value.pop();
		if (!this.validate(tempAttrs)) {
			// if the new attributes don't pass validation, abort. No need to return
			// a failure case since an error callback is mandatory.
			return false;
		}

		// copy over our current attributes to the previous
		this._previousAttributes = this.getAttributes();
		this.attributes = tempAttrs;
		this._dirty = true;

		// fire events for all changes
		if (!suppressEvent) {
			this.holdEvents();

			// fire deletion for the actual array index affected
			tempPath = path + '.' + value.length;
			this._propertyChange(tempPath, false, this.getPrevious(tempPath), undefined, tempPath);

			// fire updates for all parent properties
			path = path.split('.');
			while (path.length) {
				tempPath = path.join('.');
				this._propertyChange(tempPath, false, this.getPrevious(tempPath), this.get(tempPath), tempPath);
				path.pop();
			}

			this.fireHeldEvents();
		}

		return newLen;
	},

	//=============================================================================================
	//	Misc

	// Create a new model with identical attributes and validation to this one
	clone : function(cloneEvents)
	{
		// create a new, blank object with our attributes
		var newCtor = function(){},
			obj,
			attribs = this.getAttributes();

		JSchema.extendAndUnset(newCtor.prototype, this.Model.prototype);

		// clear the ID attribute for the new record, if configured
		if (this.options.idField && this.options.clearIdOnClone) {
			delete attribs[this.options.idField];
		}

		// create the copy
		obj = new newCtor();
		obj.Model = this.Model;
		JSchema.Binding.call(obj, attribs, this.schema, this.options);

		// register it with our model
		if (obj.options.idField) {
			var newId = obj.getId();
			if (newId) {
				this.Model.instances[newId] = obj;
			} else {
				this.Model.newInstances.push(obj);
			}
		}

		// clone events if specified
		if (cloneEvents) {
			obj._callbacks = {};
			JSchema.extendAndUnset(obj._callbacks, this._callbacks);
		}

		return obj;
	},

	// Call this method to manually fire a 'change' event
	// Calling this will cause all callbacks listening to the record to run
	change : function(options)
	{
		this.fireEvent('change', this, this.getPreviousAttributes());
	},

	//=============================================================================================
	//	Internals

	/**
	 * Fire a change event for one of the record's properties changing. Also handles reassignment
	 * of the record in its model's instance array when options.idField is set.
	 *
	 * @param  {string} propertyString name of the property changed (dot notation)
	 * @param  {string} isCreating	if true, record is being created. Used to determine change subevent name.
	 * @param  {mixed} oldValue		value of the attribute before the change
	 * @param  {mixed} newValue		new value of the attribute currently in the object
	 * @param  {string} attrIndex	the dot-delimited record index of the property being changed
	 */
	_propertyChange : function(propertyString, isCreating, oldValue, newValue, attrIndex)
	{
		var changeAction,
			stopAtLevel = 0;

		if (isCreating || oldValue === undefined) {
			changeAction = 'create';
			if (!isCreating) {
				// trailing create & delete events shouldn't bubble - update callback will run instead for higher attributes
				stopAtLevel = propertyString.split('.').length + 1;
			}
		} else if (newValue === undefined) {
			changeAction = 'delete';
			// trailing create & delete events shouldn't bubble - update callback will run instead for higher attributes
			stopAtLevel = propertyString.split('.').length + 1;
		} else {
			changeAction = 'update';
		}

		// check for id being set and reassign in instances register
		if (this.options.idField && propertyString == this.options.idField) {
			var oldId;
			if (oldId = this.getPrevious(propertyString)) {
				// existing record, delete from instances array
				delete this.Model.instances[oldId];
			} else {
				// new record, delete from new instances array
				for (var i = 0, l = this.Model.newInstances.length; i < l; ++i) {
					if (this.Model.newInstances[i] === this) {
						this.Model.newInstances.splice(i, 1);
						break;
					}
				}
			}
			if (newValue) {
				if (this.Model.instances[newValue]) {
					// :TODO: this could be handled better after implementing undo
					throw new Error("Cannot reassign record ID: record already exists");
				}
				this.Model.instances[newValue] = this;
			} else {
				this.Model.newInstances.push(this);
			}
		}

		var eventName = 'change.' + changeAction + '.' + propertyString;
		this.fireEventUntilDepth(eventName, stopAtLevel, this, oldValue, newValue, attrIndex, eventName);
	},

	/**
	 * Run schema validation against a set of incoming attributes, returning true
	 * if all is well. If any errors are found, the error result object of the JSON schema
	 * validator is sent to any error callbacks registered.
	 */
	validate : function(attrs)
	{
		if (!this._validating) {
			return true;
		}

		attrs = JSchema.extendAndUnset(this.getAttributes(), attrs);

		var r = this.schema.validate(attrs);
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

	pauseValidation : function()
	{
		this._validating = false;
	},

	resumeValidation : function()
	{
		this._validating = true;
	},

	/**
	 * Handles merging of record subobjects & firing of appropriate change events
	 *
	 * @param	String	eventStr	Event to fire. Starts as 'change:' + the base attribute name.
	 *                        		Subsequent recursions into the object will fire events appended
	 *                        		with '.' + the subattribute name.
	 * @return	2-length array of the merged object, and a boolean indicating whether subproperties were modified.
	 */
	_handleObjectChange : function(eventStr, oldObject, newObject, suppressEvent, isCreating)
	{
		var childrenChanged = false,
			src,
			copy,
			clone;

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

		for (var name in newObject) {
			src = oldObject[ name ];
			copy = newObject[ name ];

			// Prevent never-ending loop
			if ( oldObject === copy ) {
				continue;
			}

			// make a new string to fire an event for this child changing
			var newEventStr = eventStr + '.' + name;

			// Recurse if we're merging plain objects or arrays
			copyIsArray = false;
			if ( copy && ( jQuery.isPlainObject(copy) || (copyIsArray = jQuery.isArray(copy)) ) ) {	/* LIBCOMPAT */
				if ( copyIsArray ) {
					copyIsArray = false;
					clone = src && jQuery.isArray(src) ? src : [];	/* LIBCOMPAT */
				} else {
					clone = src && jQuery.isPlainObject(src) ? src : {};	/* LIBCOMPAT */
				}

				var results = this._handleObjectChange(newEventStr, clone, copy, suppressEvent, isCreating);

				oldObject[ name ] = results[0];
				childrenChanged = true;			// tell our parent to fire modified, too

				// if children were modified, fire a change event for us too!
				if (results[1] && !suppressEvent) {
					this._propertyChange(newEventStr, isCreating, src, oldObject[name], newEventStr);
				}
			} else if (src != copy) {
				oldObject[ name ] = copy;
				childrenChanged = true;	// tell our parent to fire modified, too

				// fire a change event for the modified property
				if (!suppressEvent) {
					this._propertyChange(newEventStr, isCreating, src, copy, newEventStr);
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
					this._propertyChange(eventStr + '.' + i, isCreating, previousObject[i], undefined, eventStr + '.' + i);
					++i;
				}
			}
			childrenChanged = true;
		}

		// fire a change event for ourselves when bubbling back up
		if (childrenChanged && !suppressEvent) {
			this._propertyChange(eventStr, isCreating, previousObject, oldObject, eventStr);
		}

		return [oldObject, childrenChanged];
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

// Alias methods
JSchema.Binding.prototype.getAll = JSchema.Binding.prototype.getAttributes;

//=============================================================================================
// Static methods

// Creates a Binding subclass with the desired validation schema and options
JSchema.Binding.Create = function(schema, options)
{
	if (!schema) {
		throw "Could not create JSchema.Binding Model - schema is not a JSONSchema!";
	}
	// attempt registering the schema if it is not already a reference to one
	if (!JSV.isJSONSchema(schema)) {
		// if it has an id, check whether it's already been registered
		if (!schema['id'] || !(schema = JSchema.getSchema(schema.id))) {
			// and if not, register it
			schema = JSchema.registerSchema(schema);
		}
	}

	options = options || {};
	var ctor = function(attrs, instanceOpts) {
		var newCtor = function(){},
			newO;

		JSchema.extendAndUnset(newCtor.prototype, ctor.prototype);
		// console.log(newO, newCtor.prototype === newO.prototype);

		newO = new newCtor();
		newO.Model = ctor;
		JSchema.Binding.call(newO, attrs, schema, instanceOpts || options);

		if (newO.options.idField) {
			var newId = newO.getId();
			if (newId) {
				ctor.instances[newId] = newO;
			} else {
				ctor.newInstances.push(newO);
			}
		}

		return newO;
	};

	// add methods
	JSchema.extendAndUnset(ctor.prototype, JSchema.Binding.prototype);

	// add static array for storing instances of this record type, and
	// a static method for retrieving them
	ctor.instances = {};
	ctor.newInstances = [];
	ctor.getRecordById = ctor.prototype.getRecordById;
	ctor.getInstanceCount = ctor.prototype.getInstanceCount;
	ctor.getAllInstances = ctor.prototype.getAllInstances;
	ctor.addEvent = function() {
		this.prototype.addEvent.apply(this.prototype, arguments);
	};
	ctor.addEvents = function() {
		this.prototype.addEvents.apply(this.prototype, arguments);
	};
	ctor.removeEvent = function() {
		this.prototype.removeEvent.apply(this.prototype, arguments);
	};

	return ctor;
};

}).call(this, jQuery);	/* LIBCOMPAT */
