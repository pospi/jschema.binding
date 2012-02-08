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
					this._propertyChange(attr, isCreating ? undefined : oldVal, val);
				}
			}
		}

		if (changes && !suppressEvent) {
			// fire a general update event
			this.fireEvent((isCreating ? 'change.create' : 'change.update'), this, this.getPreviousAttributes());
			// Fire the "change" event if the model has been changed
			this.fireEvent('change', this, this.getPreviousAttributes());

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

		// Search temporary object for the property to set and create subrecords if necessary
		var searchResult = JSchema.dotSearchObject(tempAttrs, attr, true, true);

		var parent = searchResult[0],
			value = parent[searchResult[1]],
			path = searchResult[2];

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
		this._dirty = true;

		// fire events for all changes
		if (!suppressEvent) {
			this._bubblePropertyChange(attr, this.getPrevious(attr), newVal);
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
			path = searchResult[2];

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
			this._bubblePropertyChange(attr, value, undefined);
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
			// :TODO:
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
			newLen = value.length;

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
			this._bubblePropertyChange(attr, undefined, val);
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
			newLen = value.length - 1;

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
			this._bubblePropertyChange(attr, this.getPrevious(attr), undefined);
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

	//=============================================================================================
	//	Internals

	/**
	 * Fire a change event for one of the record's properties changing. Also handles reassignment
	 * of the record in its model's instance array when options.idField is set.
	 *
	 * @param  {string} propertyString name of the property changed (dot notation)
	 * @param  {mixed} oldValue		value of the attribute before the change
	 * @param  {mixed} newValue		new value of the attribute currently in the object
	 * @param  {string} attrIndex	the dot-delimited record index of the property being changed
	 */
	_propertyChange : function(propertyString, oldValue, newValue)
	{
		var changeAction,
			// we shouldn't bubble these events internally, since parent attributes must receive
			// their own parameters for callbacks bound at their level
			stopAtLevel = propertyString.split('.').length + 1;

		if (oldValue === undefined) {
			if (newValue === undefined) {
				return;	// nothing existing or deleted
			}
			changeAction = 'create';
		} else if (newValue === undefined) {
			changeAction = 'delete';
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
		this.fireEventUntilDepth(eventName, stopAtLevel, this, oldValue, newValue, propertyString, eventName);
	},

	/**
	 * Run schema validation against a set of incoming attributes, returning true
	 * if all is well. If any errors are found, the record and the error result object
	 * of the JSON schema validator is sent to any error callbacks registered, along
	 * with some additional properties to help deal with the error:
	 * 	- recordProperty	a string in dot notation to access the property within the record
	 * 	- current			the existing value of the attribute
	 * 	- invalid			the invalid value which caused the error
	 * Note that these properties are only set when they exist on the object, otherwise
	 * they will be left unfilled.
	 */
	validate : function(attrs)
	{
		if (!this._validating) {
			return true;
		}

		attrs = JSchema.extendAndUnset(this.getAttributes(), attrs);

		var r = this.schema.validate(attrs);
		if (r.errors.length) {
			// interpret error data from JSV
			var error,
				attr, dotattr,
				fragmentRes,
				fragmentChar,
				constraintType,
				constraintReason,
				oldValue,
				attemptedValue,
				tempPath;

			this.holdEvents();

			for (var i = 0; i < r.errors.length; ++i) {
				error = r.errors[i];
				attr = error.uri.substr(error.uri.indexOf('#') + 2);

				// determine fragment identifier in order to retrieve attribute
				fragmentRes = this.schema.getValueOfProperty('fragmentResolution');
				if (fragmentRes) {
					switch (fragmentRes) {
						case 'slash-delimited':
							fragmentChar = '\/';
							break;
						case 'dot-delimited':
							fragmentChar = '.';
							break;
					}
				} else {
					fragmentChar = this.schema.getEnvironment().getDefaultFragmentDelimiter();
					if (fragmentChar == '/') fragmentChar = '\/';	// escape for regex
				}

				dotattr = attr.replace(new RegExp(fragmentChar, 'g'), '.');
				constraintType = error.attribute;
				constraintReason = error.details;

				// :TODO: make error messages a bit friendlier
				switch (constraintType) {
					case "dependencies":
						// :TODO:
						break;
					// :NOTE: 'additionaProperties' is the validation error thrown when no matching
					//			properties or patternProperties are found for some data
					case "additionalProperties":
						var j, k, regex, failedSchema = this.schema.getEnvironment().findSchema(error.schemaUri);
						if (dotattr) {
							oldValue = this.get(dotattr);
						} else {
							oldValue = this.getAttributes();
						}
						attemptedValue = JSchema.dotSearchObject(attrs, dotattr);

						// filter out the valid properties from the returned set
						var permissable = failedSchema.getAttribute('properties');
						if (permissable) {
							for (j in permissable) {
								if (permissable.hasOwnProperty(j) && attemptedValue && typeof attemptedValue[j] != 'undefined') {
									delete attemptedValue[j];
								}
							}
						}

						// do the same for regex properties
						permissable = failedSchema.getAttribute('patternProperties');
						if (permissable) {
							for (j in permissable) {
								if (permissable.hasOwnProperty(j)) {
									regex = new RegExp(permissable[j]);
									for (k in attemptedValue) {
										if (!k.match(regex)) {
											delete attemptedValue[k];
											break;
										}
									}
								}
							}
						}
						break;
					// :NOTE: 'items' validation is taken care of in subschemas. 'additionalItems'
					//		  is thrown when 'items' is an array and there are too many elements.
					case "additionalItems":
						var failedSchema = this.schema.getEnvironment().findSchema(error.schemaUri),
							numPermissable = failedSchema.getAttribute('items').length,
							oldValue = this.get(dotattr),
							attemptedValue = JSchema.dotSearchObject(attrs, dotattr);
						attemptedValue = attemptedValue.slice(numPermissable);
						break;
					// simple constraints (those which are defined directly under the property to which they correspond)
					default:
						oldValue = this.get(dotattr);
						attemptedValue = JSchema.dotSearchObject(attrs, dotattr);
						break;
				}

				r.errors[i]['recordProperty'] = dotattr;
				if (typeof oldValue != 'undefined') {
					r.errors[i]['current'] = oldValue;
				}
				if (typeof attemptedValue != 'undefined') {
					r.errors[i]['invalid'] = attemptedValue;
				}
				error = r.errors[i];

				// fire an error for this property
				this.fireEvent('error.' + dotattr, this, attemptedValue, dotattr, error);

				// fire errors for all parent properties
				dotattr = dotattr.split('.');
				while (dotattr.length) {
					dotattr.pop();
					if (!dotattr.length) {
						break;
					}
					tempPath = dotattr.join('.');
					this.fireEvent('error.' + tempPath, this, JSchema.dotSearchObject(attrs, tempPath), tempPath, error);
				}
			}

			this.fireEvent('error', this, r.errors)

			if (!this.fireHeldEvents()) {
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
					this._propertyChange(newEventStr, isCreating ? undefined : src, oldObject[name]);
				}
			} else if (src != copy) {
				oldObject[ name ] = copy;
				childrenChanged = true;	// tell our parent to fire modified, too

				// fire a change event for the modified property
				if (!suppressEvent) {
					this._propertyChange(newEventStr, isCreating ? undefined : src, copy);
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
					this._propertyChange(eventStr + '.' + i, isCreating ? undefined : previousObject[i], undefined);
					++i;
				}
			}
			childrenChanged = true;
		}

		// fire a change event for ourselves when bubbling back up
		if (childrenChanged && !suppressEvent) {
			this._propertyChange(eventStr, isCreating ? undefined : previousObject, oldObject);
		}

		return [oldObject, childrenChanged];
	},

	/**
	 * Bubbles a single property change from its origin all the way back up the object,
	 * sending correct data to the events bound at each level.
	 *
	 * @param  {string} path        dot-notated index of the attribute affected
	 * @param  {mixed}  oldVal		value the attribute was changed from
	 * @param  {mixed}  newVal		value the attribute was changed to
	 * @param  {bool} 	isClearing  (optional) if true, fire a delete event at the top level. this is much more efficient than determining internally.
	 */
	_bubblePropertyChange : function(path, oldVal, newVal, isClearing)
	{
		var tempPath;

		this.holdEvents();

		// fire bottom-level event
		this._propertyChange(path, oldVal, newVal);

		// fire updates for all parent properties
		path = path.split('.');
		while (path.length) {
			path.pop();
			if (!path.length) {
				break;
			}
			tempPath = path.join('.');
			this._propertyChange(tempPath, this.getPrevious(tempPath), this.get(tempPath));
		}

		// fire nonspecific change events
		var prev = this.getPreviousAttributes(),
			eventName = 'update';
		if (isClearing) {
			eventName = 'delete';
		} else if (!prev) {
			eventName = 'create';
		}
		this.fireEvent('change.' + eventName, this, this.getPreviousAttributes());
		this.fireEvent('change', this, this.getPreviousAttributes());

		this.fireHeldEvents();
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
