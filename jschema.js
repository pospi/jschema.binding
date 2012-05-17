/**
 * JSchema.Binding
 * -------------------
 * A lightweight module for managing data-driven UI events and handling
 * clientside data validation.
 *
 * Allows UI elements and other code to bind themselves to shared data and
 * recieve updates / notifications when that data is modified. JSON schemas
 * are passed to new data model definitions to automatically validate data.
 *
 * Change events are fired in order from the deepest property modified up to
 * the topmost. Returning false from any event callback will break this chain,
 * in the same manner as cancelling DOM event bubbling.
 *
 * Usage:
 *	var MyModel = JSchema.Binding.Create(
 *					jsonSchemaDefn,
 *					options
 *			  	);
 *	var record = new MyModel(
 *					attributes,
 *					options
 *				);
 *
 * For portability, no external frameworks are required other than JSV and json2.js,
 * however jQuery is builtin for core typechecking functions. You can track these dependencies
 * down by searching the source for the comment tag 'LIBCOMPAT'. Other branches will be
 * added for various other javascript frameworks as requested.
 *
 * The global object JSchema contains all objects and functionality relative to your
 * data and validation purposes - it is declared below along with the base JSV
 * validator to use for validating data.
 *
 * This class takes some of its ideas and principles from Jeremy Ashkenas' wonderful
 * Backbone.js (http://documentcloud.github.com/backbone) - for a full-featured replication
 * handler, look to this project when you don't require JSON schema validation.
 *
 * @package		JSchema.Binding
 * @depends		jQuery 1.7.1	http://jquery.com
 * @depends		JSV				https://github.com/garycourt/JSV
 * @depends		json2.js		https://github.com/douglascrockford/JSON-js, required for older browsers only
 * @author		pospi <pospi@spadgos.com>
 */
var JSchema = {
	Validator : JSV.createEnvironment('json-schema-draft-03'),

	/**
	 * Register a schema with the schema validator. Doing so allows other schemas
	 * referencing this one to find it by its 'id' URI.
	 * @param  {object} schema schema definition to register
	 * @param  {string} uri    (optional) if provided, registers the schema under this URI.
	 *                         When ommitted the uri is retrieved from the schema's ID.
	 * @return JSONSchema instance from JSV
	 */
	registerSchema : function(schema, uri)
	{
		if (!uri) {	// attempt loading URI from the schema's ID if not provided
			uri = schema.id;
		}
		try {
			var schema = JSchema.Validator.createSchema(schema, undefined, uri);
			return schema;
		} catch (e) {
			if (e.message && e.details) {
				// add specifics of the error to make things easier to debug
				e.message += ": " + e.details;
			}
			throw e;
		}
		return null;
	},

	/**
	 * Retrieve a registered schema by its URI
	 * @param  {string} uri URI of the schema to load. This will either be the URI
	 *                      passed to registerSchema(), or the 'id' attribute of the schema.
	 * @return {object}
	 */
	getSchema : function(uri)
	{
		return JSchema.Validator.findSchema(uri);
	},

	/**
	 * Determine if something is an instance of a JSchema.Binding data Model
	 * @param  {mixed}  thing variable to check
	 * @param  {JSchema.Binding} model (optional) model object to check whether the record is an instance of
	 * @return {Boolean}
	 */
	isRecord : function(thing, model)
	{
		if (model) {
			return thing instanceof model && JSchema.isModel(model);
		}
		return thing instanceof JSchema.Binding && (!thing.prototype || !(thing.prototype instanceof JSchema.Binding));
	},

	/**
	 * Determine if something is a JSchema.Binding data Model
	 * @param  {mixed}  thing variable to check
	 * @return {Boolean}
	 */
	isModel : function(thing)
	{
		return thing.prototype !== undefined && thing.prototype instanceof JSchema.Binding;
	},

	/**
	 * Recursively extends an object's prototype with the object passed in.
	 * This acts similarly to (and is heavily based upon) jQuery's extend(),
	 * except that explicitly set 'undefined' values have the effect of
	 * unsetting values in the original object.
	 */
	extendAndUnset : function()
	{
		var options, name, src, copy, copyIsArray, srcIsArray, clone,
			target = arguments[0] || {},
			i = 1,
			length = arguments.length;

		// Handle case when target is a string or something (possible in deep copy)
		if ( typeof target !== "object" && !jQuery.isFunction(target) ) {	/* LIBCOMPAT */
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
					if ( copy && ( jQuery.isPlainObject(copy) || (copyIsArray = jQuery.isArray(copy)) ) ) {	/* LIBCOMPAT */
						if ( (!src && copyIsArray) || (srcIsArray = jQuery.isArray(src)) ) {	/* LIBCOMPAT */
							clone = src && srcIsArray ? src : [];
						} else {
							clone = src && jQuery.isPlainObject(src) ? src : {};	/* LIBCOMPAT */
						}
						copyIsArray = false;
						srcIsArray = false;

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
	},

	/**
	 * Create a deep copy of some object
	 * @param  {mixed} something thing to copy
	 * @return a copy of the thing
	 */
	deepCopy : function(something)
	{
		if (jQuery.isPlainObject(something)) {	/* LIBCOMPAT */
			return JSchema.extendAndUnset({}, something);
		} else if (jQuery.isArray(something)) {	/* LIBCOMPAT */
			return JSchema.extendAndUnset([], something);
		} else {
			return something;
		}
	},

	/**
	 * Retrieve a property in a JavaScript object by using
	 * dot notation to index child members.
	 * When used without returnParent=true, returns the property specified.
	 * When used with, returns an array of:
	 * 			- the parent element of the subproperty
	 * 			- the key of the target element inside it
	 * 			- the path of the parent element in the hierarchy
	 *
	 * @param  {object} target (nested) object to retrieve a property from
	 * @param  {string} attr   dot-notated string property to get (eg. 'myObject.subObject.childValue')
	 * @param  {bool}	returnParent	if true, return the parent of the matched variable instead of itself
	 * @param  {bool} 	createSubobjects	if true, this method will create subindexes into the object for the target attribute
	 * @param  {JSONSChema} topLevelSchema	when creating subobjects automatically, set this to the top-level schema of the object
	 *                                     	to read datatypes from it and create parent elements as arrays where appropriate to match
	 *                                     	the object's structure.
	 * @return {mixed}
	 */
	dotSearchObject : function(target, attr, returnParent, createSubobjects, topLevelSchema)
	{
		var parts = attr.split('.'),	// keys to index, in order
			prevTarget,					// used to return match's parent node
			currentPath = [],			// current path of the search
			cannotMatch = false,		// abort early if we can't recurse deep enough
			key,						// current key we are searching
			subAttr, subSchema, fragmentSeparator;

		target = target || {};
		if (!attr) {
			return target;
		}

		// cache fragment separator if creating new objects with schema checks for subindexes
		if (createSubobjects && topLevelSchema) {
			fragmentSeparator = JSchema.getFragmentResolutionCharacter(topLevelSchema);
		}

		while (parts.length) {
			key = parts.shift();
			if (typeof target[key] == 'undefined') {
				if (createSubobjects) {
					// if we are able to check against a schema, we can preallocate parent arrays correctly as well
					if (JSV.isJSONSchema(topLevelSchema)) {
						subAttr = topLevelSchema.resolveURI('#' + fragmentSeparator + 'properties' + fragmentSeparator
								+ (currentPath.length ? currentPath.join(fragmentSeparator) + fragmentSeparator : '')
								+ key);
						subSchema = JSchema.getSchema(subAttr);
						if (subSchema && subSchema.getValueOfProperty('type') == 'array') {
							target[key] = [];
						} else {
							target[key] = {};
						}
					} else {
						target[key] = {};
					}
				} else {
					cannotMatch = true;
					break;
				}
			} else if (!(jQuery.isArray(target) || jQuery.isPlainObject(target))) {	/* LIBCOMPAT */
				cannotMatch = true;
				break;
			}
			currentPath.push(key);
			prevTarget = target;
			target = target[key];
		}
		if (parts.length || cannotMatch) {		// wasn't found
			return returnParent ? [undefined, key, currentPath.join('.')] : undefined;
		}
		if (returnParent) {
			return [prevTarget, key, currentPath.join('.')];
		}
		return target;
	},

	/**
	 * Convert between dot-notated property syntax from JSchema and uri format of whatever
	 * schema you require inspection of.
	 *
	 * @param  {string} attr      path to convert
	 * @param  {bool}   backwards if true, convert from a JSON schema uri to a JSchema path instead of vice-versa
	 * @param  {JSONSchema} schema    schema to convert paths between
	 * @param  {JSchema Model} model  record model object to cache the schema's fragment separator character on. Used
	 *                         		  internally by Record instances to speed up uri translation.
	 * @return the converted path
	 */
	pathToSchemaUri : function(attr, backwards, schema, model)
	{
		var fragmentChar = false;

		// determine fragment replacement character if no model passed for caching,
		// or model has no cached fragment separator yet.
		if (model === undefined || !model._fragmentChar) {
			fragmentChar = JSchema.getFragmentResolutionCharacter(schema);
		}
		// if fragment successfully determined & cacheable, cache it
		if (fragmentChar && model !== undefined) {
			model._fragmentChar = fragmentChar;
		}
		// if model was passed in and already had a fragment separator cached on it, read that
		if (!fragmentChar && model._fragmentChar) {
			fragmentChar = model._fragmentChar;
		}

		if (backwards) {
			return attr.replace(new RegExp(fragmentChar, 'g'), '.');
		}
		return attr.replace(/\./g, fragmentChar);
	},

	// interrogate a schema to find its fragment separator character
	getFragmentResolutionCharacter : function(schema)
	{
		if (!JSV.isJSONSchema(schema)) {
			throw "Could not determine fragment resolution character - not a JSONSchema!";
		}
		var fragmentRes = schema.getValueOfProperty('fragmentResolution');
		if (fragmentRes) {
			switch (fragmentRes) {
				case 'slash-delimited':
					fragmentChar = '/';
					break;
				case 'dot-delimited':
					fragmentChar = '.';
					break;
			}
		}
		return schema.getEnvironment().getDefaultFragmentDelimiter();
	},

	// mostly taken from Underscore.js isEqual()
	isEqual : function(a, b)
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
			if (!(key in b) || !JSchema.isEqual(a[key], b[key])) {
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
};
