JSchema.Binding
===============

*Data-driven events and validation for your javascript applications*

About
-----
JSchema.Binding is a lightweight framework for managing complex, data-driven UIs. It allows for binding UI callbacks to data *Models* (or classes) and *Records* (or instances), and for manipulating those records' data. It also provides JSON schema validation over record data using [JSV](https://github.com/garycourt/JSV) internally to check changes in real time. In a nutshell, it basically serves to keep your UI fresh, synchronised, valid and responsive. Everything else is up to you.

If you already use JSON schema with your application, think of JSchema.Binding as adding state to your validation.<br />
For simple data manipulation tasks or applications without the need for clientside data validation, Binding is a more than adequate event engine and data handling layer all on its own - just pass `false` insted of a schema when creating new Models.

Binding performs no ajax operations and is not a full MVC framework, but could easily be used as a strong foundation to build one. If you are after something more heavyweight, try the excellent [Backbone.js](http://backbonejs.org/) (which indeed influences some of Binding's design).

Please note: you should clone this repository with `git clone --recursive`.

Features
--------
- **Powerful event engine**<br />
  JSchema.Binding's event engine combines namespaced events to allow for fine-grained update callbacks with namespace wildcards to allow even more control. JSchema.EventHandler also provides a robust layer for implementing events on any other non-DOM javascript objects in your applications.
	- **Event namespacing**<br />
	  Allows responding to changes in object subproperties with infinite granularity
		- A modification to the object `addEvent('change', ...);`
		- A deletion within the object `addEvent('change.delete', ...);`
		- An update to *propertyA* `addEvent('change.update.propertyA', ...);`
		- An update to *propertyA* of *objectB* `addEvent('change.update.objectB.propertyA', ...);`
	- **Event bubbling**<br />
	  Changes to deeply nested object properties bubble up to their parents with the correct parameters being passed back to bound callbacks. So a change to *objectA.propertyB* would first fire callbacks with the values for *propertyB*, and then again with values for *objectA*. Bubbling can be aborted by returning `false` in callbacks, just like with DOM events. This allows you stop bubbling back up the callback namespace chain early once you have processed everything relevant to a change.
	- **Callback wildcards**<br />
	  Allows binding events with even finer control, for example:
		- An update to *propertyA* `addEvent('change.update.propertyA', ...);`
		- *propertyA* being initialised `addEvent('change.create.propertyA', ...);`
		- Any type of modification to *propertyA* `addEvent('change.?.propertyA', ...);`
		- An update to the record's *propertyA*, or to any *propertyA* within any subobjects of the record `addEvent('change.update.*.propertyA', ...);`
	- **Event marshalling**<br />
	  Allows events to be pooled, combined and fired as a single logical 'change'.
	- **Callback data consistency**<br />
	  Record state is predictable in all callbacks - firing is deferred until the state of the object has completed updating.
- **Change handling**<br />
  Records can be checked for modifications to allow intelligent serverside data pushing, and uploaded propertysets can be refined to only those modified. Snapshots of data can be taken at any point in time and compared with one another or checked for changes easily.
- **JSON schema validation**<br />
  Naturally, all changes to data objects are validated against your schema in real-time and can provide feedback of any changes and errors straight to your UI or other application code.
	- **Enhanced errors**<br />
	  JSV's standard error objects are augmented with attributes for the current value,
	- **Error bubbling**<br />
	  Using the same event mechanism as with change events, errors bubble up to their parent properties. The array of schema error data at each point in the chain contains all errors relevant for that object and all its child properties.
- **Record composition**<br />
  Record instances can be seamlessly inserted into each other providing for composite data relationships and sharing of data between records. JSchema allows you to deal directly with the data whilst ensuring that changes to attributes from a parent record immediately propagate to attributes shared with their children, and from child records back up to their parents.
- **ID tracking**<br />
  When configured to do so, record IDs are automatically tracked and record instances can be retrieved from your models via `getRecordById()`.

Compatibility
-------------
JSchema.Binding has minimal coupling to any library and uses jQuery only for utility methods. Separate branches exist for compatibility with other libraries, and lines of code dependency are clearly denoted by the comment `LIBCOMPAT`.

**Branches**:

- `git checkout mootools` (:TODO:)

Usage
-----
The first thing you'll want to do with a Binding instance is create a *model* (think 'class') for it. To do this, you simply call `JSchema.Binding.Create(schema, options)`:

> **Schema**<br />
> The JSON schema document used to validate this record, as a javascript object.
>
> **Options**<br />
> A map of options for the new record class.
>
>> - `idField` Setting this property enables you to manage your record objects by primary key or other dentifying information, using the Record method `getId()` to retrieve object IDs, and Model method `getRecordById()` to retrieve record instances by those IDs.
> - `doCreateEvents` If true, callbacks bound to any create events will fire when instantiating the record. Defaults to false.
>> - `clearIdOnClone` If true, records cloned from others will have their IDs reset. Defaults to false. Do not enable this if your schema prohibits records without an ID field!
>> - `validateCreation` If true, records should be validated when they are initialised for the first time. Defaults to false.

Once you have your model ready, you can bind events to it and begin creating instances:

```
     var person = JSchema.Binding.Create({ ... });
	 person.prototype.addEvent('change.update.name', function(newName) { alert('My name is now ' + newName); });
	 var Jimmy = new person({ ... });
	 Jimmy.set({name : 'Denny'}); 	// "My name is now Denny"
```
You can add events to particular instances too, if you wish:

```
    Jimmy.addEvent('change.update.name', function() { alert('Thank god! Jimmy changed his name back.'); });
	Jimmy.set({name : 'Jimmy'});
	// "Thank god! Jimmy changed his name back."
    // "My name is now Jimmy"
```

In normal usage, you'll probably first want to pull down your JSON schema files and record data from an external source. You would typically do something like the following:

	// create a data model for validation
	var schema = jQuery.getJSON(/* some URL containing a validation schema... */);
	var Model = JSchema.Binding.Create(schema, {
		idField : 'record_id',
		clearIdOnClone : true
	});

	// bind some events to these records
	Model.addEvent('change', function(record, prevData) {
		// update something...
	});
	// ...

	// load and create a record
	var data = jQuery.getJSON(/* some URL containing a record... */);
	var something = new Model(data);

	// updating the record triggers events
	something.set({
		someProperty : 'some value'
	});
	// change callback triggered, something updated!

	// later in our program, we can check if the record needs saving...
	if (something.isDirty()) {
		// and update by posting the entire record back...
		jQuery.post(/* some URL for updating the record */, something.getAll());
		// ...or just the changes.
		jQuery.post(/* some URL for updating the record */, something.getChangedAttributes());

		// note that we would call something.changesPropagated() upon a successful POST call being completed
	}

My APIs, Let Me Show You Them
-----------------------------

### Events ###
JSchema.Binding records recognise the following events:

- `error`<br />
	Fires in response to an error updating the data record. Receives as parameters the record instance and an array of error objects from JSV, augmented with some of Binding's own:

	```
	{
		    "uri": "URI of the instance that failed to validate",
		    "schemaUri": "URI of the schema instance that reported the error",
		    "attribute": "The attribute of the schema instance that failed to validate",
		    "message": "Error message",
		    "details": // The value of the schema attribute that failed to validate

		    // JSchema.Binding properties
		    "recordProperty" : 	// the dot-notated index of the property which failed to validate
		    "current" :			// the current, (assumedly) valid value of the errored property
		    "invalid" : 		// the value of the passed property which invalidated the record
	}
	```

	Error callbacks can also be bound to specific properties within the object using dot notation. When bound, these callbacks will recieve the record instance, invalid value that broke the record, dot-notated index of the invalid property and the relevant error object from JSV. One callback is fired for each error object passed to the top-level error callback.
- `change`<br />
	Fires in response to a change in the record. Receives the current record instance and previous data bundle as parameters.
- `change.update`<br />
	Fires in response to an update of the record, or an update of a particular value on the record. Receives as parameters the current record instance, previous value, new value, dot-notated index of the property modified and name of the event fired.
	This callback, as well as `change.create` and `change.delete`, can also be bound to any number of subnamespaces, denoting indexes into the data record and its subproperties.
- `change.create`<br />
	Fires in response to a property initialisation within the record, in the same manner as `change.update`. The previous value will be undefined in this case.
- `change.delete`<br />
	Fires in response to a property being deleted within the record, in the same manner as `change.update`. The new value will be undefined in this case.

### Methods ###

### Global Methods ###

These methods can be found on the global `JSchema` object.

- `registerSchema(schema, uri)`<br />
	Allows registering a schema definition with JSV, in order for other schemas to be able to reference it by its URI. If the uri is ommitted, the `id` field of the schema itself will be used instead.

- `getSchema(uri)`<br />
	Allows retrieving a schema previously registered with `registerSchema()`.

- `isRecord(thing[, model])`<br />
	Determine whether the passed argument is a JSchema.Binding data record. If the `model` parameter is provided, the method also checks whether the record is an instace of the given model.

- `isModel(thing)`<br />
	Determine whether the passed argument is a JSchema.Binding data model

### Model Methods ###

These methods are available to record Model instances.

- `getRecordById(id)`<br />
   When the `idField` option is provided, records are automatically referenced in their corresponding models. This method can be used to retrieve them by those IDs.
- `getInstanceCount(includeNew = false)`<br />
   Retrieve the number of active Records of this Model. By default, only saved records (those with IDs) are returned. To return all objects, pass <tt>true</tt>.
- `getAllInstances(includeNew = false)`<br />
   Get a map of all active records, indexed by ID. If <tt>true</tt> is passed, unsaved records will be returned as well under the indexes '<tt>new#0</tt>', '<tt>new#1</tt>' etc

### Record Methods ###

These methods are available to all individual Record instances.

#### Event Handling (`JSchema.EventHandler`) ####

- `addEvent(eventName, callbackFn, [context])`<br />
	 Bind a callback to an event on an object. Optional third parameter specifies the 'this' argument of the callback function. Also available to Model instances.
- `addEvents(events)`<br />
	 Bind a number of callbacks to various events all at once. Callbacks will be bound to events matching the key names of the passed object. Also available to Model instances.
- `removeEvent([eventName, [callback]])`<br />
	 Unregister previously bound callback events. You can remove all events by passing no arguments, a whole callback set by passing the callback name, and a specific callback by passing the callback name and bound function. Also available to Model instances.
- `holdEvents()`<br />
	 Begins event marshalling: data modification will not execute event callbacks, but instead keep a cache of all callbacks called while in this state. Calling `fireHeldEvents()` will execute all callbacks fired while in this state. Usually (as with the below event methods) used internally by JSchema.Binding, but useful elsewhere as well.
- `eventQueued(eventName)`<br />
   Checks whether an event has been fired whilst marshalling.
- `unfireEvent(eventName)`<br />
   Remove an event called whilst marshalling from the called event cache to prevent it from firing when marshalled events are applied.
- `abortHeldEvents()`<br />
	 Stop holding events from firing and clear out the held event cache.
- `fireHeldEvents()`<br />
	 Merge and fire all events accumulated during the last hold phase.
- `fireEvent(eventName, ...)`<br />
	 Fire an arbitrarily named event, passing all arguments following the event name to matching callback functions. Callbacks matching all namespaces of the event will be called upward in turn, unless `false` is returned from one of the callbacks to abort the bubbling.
- `fireEventUntilDepth(eventName, depthToStopAt = 0, ...)`<br />
   Fire event callbacks matching this event, but only up to a certain namespace depth.

#### Data Manipulation ####

* `set()`<br />
	Sets data on a record. Note that all data manipulation operations can be performed with `set()`, they exist mostly for convenience. Accepts two paramter formats:
	* `object`, `bool`<br />
	   Merges this object's values in with the record's. To unset values, set `undefined` in their place.
	   The second parameter controls whether (true) or not (false) to suppress event firing.
	* `string`, `mixed`, `bool`<br />
	   Sets the attribute at this index (specified by dot notation).
	   Param 2 is the value to set, param 3 controls whether (true) or not (false) to suppress event firing.
* `setId(newId)`<br />
	Sets the record's Id, which can be any scalar value. `idField` must be configured in options for this method to work.
* `unset(attribute, suppressEvent)`<br />
	Unsets one of the record's attributes. Accepts 2 parameters: the property to erase (dot notation) and a boolean to allow suppressing event firing.
* `clear(suppressEvent)`<br />
	Clear all data from the record. You may wish to override this method to reset the record's data to a clean state if your schema prohibits an empty record.
* `push(attribute, value, suppressEvent)`<br />
	Helper for array data. Allows you to append to arrays using dot notation to locate the array in the record. Accepts the attribute index, value to append and the usual flag to suppress events.
* `pop(attribute, suppressEvent)`<br />
	Helper for array data. Removes the last element of the specified array attribute.
* `clone(cloneEvents)`<br />
	Creates a duplicate of the record. If `true` is passed, the original record's instance events are copied as well. If the record's `idField` and `clearIdOnClone` options are set, this may also clear the new record's id attribute.

#### Data Validation ####

* `validate(newData)`<br />
	Manually perform validation of some data against the record. The supplied data will be merged in to the record's current attributes and checked for validity.
* `pauseValidation()`<br />
	Pause all validation when setting data on the object.
* `resumeValidation()`<br />
	Resume validation after pausing it to forcibly update the record to an invalid state.
* `setSchema(schema)`<br />
	Changes the schema used to validate the object.

#### Data Reading ####

- `isNew()`<br />
	 Checks whether the record is new. Only works if the `idField` option has been set.
- `has(attribute)`<br />
	 Checks whether an attribute has been set. The attribute is specified in dot notation.
- `get(attribute)`<br />
	 Retrieve a specific data member. The value index in the record is passed in dot notation.
- `getId()`<br />
	 Return the record's ID. Only works if `idField` has been set.
- `getAttributes()` / `getAll()`<br />
	 Retrieve a copy of the complete data record from the Binding.
- `getSubrecord(attribute)`<br />
	 Works as with `get()`, except that only subattributes which are instances of other JSchema records will be returned. Used for pulling child record objects back out of their parents after injection.

#### Change Handling ####

- `saveState(key)`<br />
	Records the attributes of the model as they are now into an internal cache by the name `key`. This can then be used with other change handling methods to query the state of the object between two distinct known times.
- `eraseState(key)`<br />
	Deletes a state previous saved with `saveState()`.
- `revertToState(key)`<br />
	Reverts a record to one of its previously saved states. Note that this does not remove the state or perform any kind of 'undo stack' operation, all prior saved states will persist. Any changes to the record will fire as usual.
- `getPrevious(attribute, since)`<br />
	Retrieve a particular attribute from before the last change using dot notation, or from a particular point in time (previously stored by `saveState()`) if `since` is specified.
- `getPreviousAttributes(since)`<br />
	Gets the full record from before the last change, or from a particular point in time if `since` is passed.
- `hasChanged(attribute, since)`<br />
	Check whether the record has changed since last edit or a saved state. If an attribute is specified, checks this property for changes. You may pass `(null, 'statename')` to determine whether the entire record has changed since a previous saved state.
- `getChangedAttributes(includePrev, old, now)`<br />
	By default, returns an object containing all properties modified in the last edit action. If `includePrev = true`, each value will instead be a 2 element array of the old and new values.<br />
	 `old` and `now` can be used to check changes between other sets of record attributes - for example, to check changes between the current record and an old state, use `getChangedAttributes(false, myRecord.getPreviousAttributes('oldState'))`.
- `isDirty()`<br />
	Allows client code to flag to this record that clientside changes to it have been dealt with in some way (propagated to server etc). This method queries whether the record needs saving.
- `changesPropagated()`<br />
	Flag that changes have been dealt with and reset the status of `isDirty()`.

### Utility Methods ###

These methods are internal to JSchema most of the time, but they're there to use if you wish.

- `JSchema.pathToSchemaUri(attr, backwards, schema, model)`<br />
	Provides translation between the dot-notation syntax used by JSchema and the internal URI format of any JSONSchema. When `backwards` is true, the translation is from a schema URI to JSchema dot-notated string. `model` is an internal argument and can optionally be provided to cache the schema's fragment identifier character somewhere for subsequent runs.

- `JSchema.extendAndUnset()`<br />
	Exactly the same as [jQuery's `extend()`](http://api.jquery.com/jQuery.extend/), except that it always expects variable length arguments and allows you to unset existing values in the first object by setting properties to `undefined` in subsequent objects. This method both augments the first object passed and returns it.

- `JSchema.dotSearchObject(target, attr, returnParent, createSubobjects, topLevelSchema)`<br />
	Manages dot notation handling of object properties. This method is capable of performing various tasks on objects depending on the arguments passed in:
	- To simply retrieve properties from a javascript object, pass the object in as `target` and the attribute to read as a string. The method returns the property or `undefined` if it doesn't exist.
	- For editing of objects, pass `returnParent = true`. The method then returns a 3-element array consisting of a reference to the object's parent element (or the original target object if reading a top-level property), index of the target object within the parent and dot-notated string targeting the parent element in the object's hierarchy. These three values can be used together to manipulate objects in any other way - deleting & changing values, popping from arrays or calling any other methods on subobjects with attached logic.
	- Setting deeply nested data can be automated by setting both `returnParent` and `createSubObjects` to `true`. When activated, rather than returning `undefined` when a value is not found, the function will recurse downward and add objects into the target at all passed indexes. Upon reaching the final index, the newly created parent object and other values are returned as before.<br />
	If you are setting data within a data record, you may also pass a `topLevelSchema` to the function. This JSONSchema can be used to determine the correct parent datatypes of new values, creating arrays instead of objects as appropriate.

- `JSchema.isEqual(a, b)`<br />
	Compare any two variables for equality (probably) as efficiently as possible. This method is pretty much taken straight from [underscore.js](http://documentcloud.github.com/underscore/).

TODO
----

### Bugs ###
- Fix revertToState() not clearing properties from the current object which aren't set in the reverting state (probably needs to get a diff of all elements, instead of stopping at top-level difference)
- Archive old attributes when event deferring is enabled
	- (symptom?) while marshalling, subsequent edits to the same property only show as the final difference afterwards
- Arrays
	- changing individual array elements directly doesnt fire events
	- when objects within arrays are set but unmodified, a change is detected on the object
- fix trailing star wildcards skipping bottom-level events when bubbling property changes
- \* wildcards appear to be working incorrectly with multiple levels

### Incomplete features ###
- Record composition:
	- Fire events from changes in child records
- fire `clear()` events properly
- Add error callback value passing for dependencies
- remove `clearIdOnClone` option or add `storeInstances` option to select between these behaviours
- set cache threshold for ID tracking to limit record storage

### Additions ###
- Retrieve & set default values from schema when creating records
	- events should fire from undefined => defaults
- validate readonly properties
- validate URI format
- Allow creating separate environments with JSV
- Expose more useful JSV methods & options
	- allow setting validateReferences & enforceReferences to false in JSV when loading
- do mootools branch

### Review ###
- fire events in correct order internally in databinding to reduce sort time when firing
- ensure all callback contexts are being carried through to execution
- refactor some duplicate EventHandler code for reuse

Known Issues
------------
- Holding events masks the return values of `fireEvent()`, `fireHeldEvents()` etc and code will be unable to determine whether callbacks have been fired (these functions always return true while marshalling to keep any errors in your own code from being raised prematurely, if anyone has any ideas on how to handle this I'd be very interested to hear them!)
- If no error callback is registered (which you should not really do anyway), invalid value setting while holding events with `holdEvents()` will trigger errors internally even if calling `abortHeldEvents()`. It will also prematurely trigger errors multiple times before `fireHeldEvents()` is called due to the same limitation.

License
-------
This software is provided under an MIT open source license, read the 'LICENSE.txt' file for details.
