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
 * The event engine implements only two types of events: change and error.
 * To cut down on callback registers, monitoring unsetting of properties can
 * be achieved with the same callback as 'change', watching for the new value
 * being undefined.
 *
 * Usage:
 *	var MyModel = JSchema.Binding.Create(
 *						jsonSchemaDefn,
 *						{idField : 'id'}
 *				);
 *	var record = new MyModel({attr : value, attr2 : value2, obj1 : { key1: value1 }, ...});
 *	record.addEvent('change', function(record) { ... });					// do something when the record changes
 *	record.addEvent('change:attr2', function(record, val, attr) { ... });	// do something when the 'attr2' property of the record changes
 *	record.addEvent('change:obj1.key1', function(record, val, attr) { ... });	// do something when the 'key1' property of the 'obj1' element of the record changes
 *	record.addEvent('error', function(record, errs) { ... });				// do something when bad data is passed to the record. If no callbacks are set, an exception will be thrown.
 *	record.set({ attr2 : value3 });
 *
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
 *
 * :TODO: handle subproperty change events
 */
var JSchema = {
	Validator : JSV.createEnvironment('json-schema-draft-03')
};
