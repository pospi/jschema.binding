JSchema.Binding
===============

*Data-driven events and validation for your javascript applications*

About
-----
JSchema.Binding is a lightweight framework for managing complex, data-driven UIs. It allows for binding UI callbacks to data records and for manipulating those records' data. In a nutshell, it basically serves to keep your UI fresh, synchronised and responsive. Everything else is up to you.

Binding performs no ajax operations and is not a full MVC framework, but could easily be used as a strong foundation to build one. If you are after something more heavyweight, try the excellent [http://backbonejs.org/](Backbone.js) (which indeed influences some of Binding's design).

> Features
> --------
>	- **JSON schema validation**<br />
>	  Naturally, all changes to data objects are validated against your schema in real-time and can provide feedback of any changes and errors straight to your UI or other application code.
>	- **Powerful event engine**<br />
>	  JSchema.Binding's event engine combines namespaced events to allow for fine-grained update callbacks with namespace wildcards to allow even more control. JSchema.EventHandler also provides a robust layer for implementing events on any other javascript objects in your applications.
>		- **Event namespacing**<br />
>		  Allows responding to changes in object subproperties with infinite granularity
>			- A modification to the object `addEvent('change', ...);`
>			- A deletion within the object `addEvent('change.delete', ...);`
>			- An update to propertyA `addEvent('change.update.propertyA', ...);`
>		- **Callback wildcards**<br />
>		  Allows even finer control, for example:
>			- An update to propertyA `addEvent('change.update.propertyA', ...);`
>			- propertyA being initialised `addEvent('change.create.propertyA', ...);`
>			- Any modification to propertyA `addEvent('change.?.propertyA', ...);`
>			- Modification of any subproperty of object1 `addEvent('change.?.object1.*', ...);`
>		- **Event marshalling**<br />
>		  Allows events to be pooled, combined and fired as a single logical 'change'. 
> 		- **Data consistency**<br />
>		  Record state is predictable in all callbacks - firing is deferred until the state of the object has completed updating.
>
> Compatibility
> -------------
> JSchema.Binding has minimal coupling to any library and uses jQuery only for utility methods. Separate branches exist for compatibility with other libraries, and lines of code dependency are clearly denoted by the comment `LIBCOMPAT`.
>
> **Branches**:
> `git checkout mootools`

The APIs, Let Me Show You Them
-----------------------------

> Initialisation
> --------------
> The first thing you'll want to do with a Binding instance is create a 'class' for it. To do this, you simply call `JSchema.Binding.Create(schema, options)`:
>
>> **Schema**<br />
>> The JSON schema document used to validate this record, as a javascript object.
>>
>> **Options**<br />
>> A map of options for the new record class.
>> 
>> - `idField` Setting this property enables you to manage your record objects by primary key or other identifying information, using the method `getId()` to retrieve object IDs.
>> - `doCreateEvents` If true, callbacks bound to any create events will fire when instantiating the record.
>> - `clearIdOnClone` If true, records cloned from others will have their IDs reset. Do not enable this if your schema prohibits records without an ID field!
>
> Once you have your record definition ready, you can bind events to it and begin creating instances:
>
> ```
>    var person = JSchema.Binding.Create({ ... });
>	 person.addEvent('change.update.name', function(newName) { alert('My name is now ' + newName); });
>	 var Jimmy = new person({ ... });
>	 Jimmy.set({name : 'Denny'}); 	// "My name is now Denny"
> ```

> You can add events to particular instances too, if you wish:
>
> ```
>    Jimmy.addEvent('change.update.name', function() { alert('Thank god! Jimmy changed his name back.'); });
>	 Jimy.set({name : 'Jimmy'});		
>	 // "Thank god! Jimmy changed his name back."
>    // "My name is now Jimmy"
> ```
>
> Events
> ------
> JSchema.Binding objects recognise the following events:
>
> - `error`<br />
>	Fires in response to an error updating the data record. Receives the record instance and an error object from JSV as its parameters:
>
>	```
>	{
>		    "uri": "URI of the instance that failed to validate",
>		    "schemaUri": "URI of the schema instance that reported the error",
>		    "attribute": "The attribute of the schema instance that failed to validate",
>		    "message": "Error message",
>		    "details": // The value of the schema attribute that failed to validate
>	}
>	```
>
> - `change`<br />
>	Fires in response to a change in the record. Receives the current record instance and previous data bundle as parameters.
> - `change.update`<br />
>	Fires in response to an update of the record. Receives the current record instance and previous data bundle as parameters.
>	This callback, as well as `change.create` and `change.delete`, can also be bound to any number of subnamespaces, denoting indexes into the data record and its subproperties.
> - `change.create`<br />
>	Fires in response to a property initialisation within the record, in the same manner as `change.update`.
> - `change.delete`<br />
>	Fires in response to a property being deleted within the record, in the same manner as `change.update`.
>
> Methods
> -------
>
>> Data Manipulation
>> -----------------
>> * `set()`<br />
>>	 Sets data on a record. Note that all data manipulation operations can be performed with `set()`, they exist mostly for convenience. Accepts two paramter formats:
>>	 * [`object`, `bool`]<br />
>>	   Merges this object's values in with the record's. To unset values, set `undefined` in their place.
>>	   The second parameter controls whether (true) or not (false) to suppress event firing.
>>	 * [`string`, `mixed`, `bool`]<br />
>>	   Sets the attribute at this index (specified by dot notation).
>>	   Param 2 is the value to set, param 3 controls whether (true) or not (false) to suppress event firing.
>> * `unset()`<br />
>>	 Unsets one of the record's attributes. Accepts 2 parameters: the property to erase (dot notation) and a boolean to allow suppressing event firing.
>> * `clear()`<br />
>>	 Clear all data from the record. You may wish to override this method to reset the record's data to a clean state if your schema prohibits an empty record.
>> * `clone()`<br />
>>	 Creates a duplicate of the record. If `true` is passed, the original object's instance events are copied as well. If the record's `idField` and `clearIdOnClone` options are set, this may also clear the new object's id attribute.
>> * `validate()`<br />
>>	 Manually perform validation of some data against the record. The supplied data will be merged in to the record's current attributes and checked for validity.
>> * `push()`<br />
>>	 Helper for array data. Allows you to append to arrays using dot notation to locate the array in the record. Accepts the attribute index, value to append and the usual flag to suppress events.
>>
>> Data Reading
>> ------------
>> - `isNew()`<br />
>>	 Checks whether the record is new. Only works if the `idField` option has been set.
>> - `has()`<br />
>>	 Checks whether an attribute has been set. The attribute is specified in dot notation.
>> - `get()`<br />
>>	 Retrieve a specific data member. The value index in the record is passed in dot notation.
>> - `getId()`<br />
>>	 Return the record's ID. Only works if `idField` has been set.
>> - `getAttributes()` / `getAll()`<br />
>>	 Retrieve a copy of the complete data record from the Binding.
>>
>> Event handling (`JSchema.EventHandler`)
>> ---------------------------------------
>> - `addEvent()`<br />
>>	 Bind a callback to an event on an object. 
>> - `addEvents()`<br />
>>	 Bind a number of callbacks to various events all at once.
>> - `removeEvent()`<br />
>>	 Unregister previously bound callback events.
>> - `holdEvents()`<br />
>>	 Prevent data modification from executing event callbacks, but keep a cache of all callbacks called while in this state. Usually (as with the below) used internally by JSchema.Binding, but useful elsewhere as well.
>> - `abortHeldEvents()`<br />
>>	 Stop holding events from firing and clear out the held event cache.
>> - `fireHeldEvents()`<br />
>>	 Merge and fire all events accumulated during the last hold phase.
>> - `fireEvent()`<br />
>>	 Fire an arbitrarily named event. Callbacks matching all namespaces of the event will be called upward in turn, unless `false` is returned from one of the callbacks to abort the bubbling.
>>
>> Change Handling
>> ---------------
>> - `getPrevious()`<br />
>>	 Retrieve a particular attribute from before the last change using dot notation, or retrieve the whole previous record.
>> - `getChangedAttributes()`<br />
>>	 Returns an object showing all changes in the last edit action. If `true` is passed, each value will instead be a 2 element array of the old and new values.
>> - `getPreviousAttributes()`<br />
>>	 Gets the full record from before the last change.
>> - `hasChanged()`<br />
>>	 Check whether the record has changed as a result of an edit.
>> - `isDirty()`<br />
>>	 Allows client code to flag to this record that clientside changes to it have been dealt with in some way (propagated to server etc). This method queries whether the record needs saving.
>> - `changesPropagated()`<br />
>>	 Flag that changes have been dealt with and reset the status of `isDirty()`.

License
-------
This software is provided under an MIT open source license, read the 'LICENSE.txt' file for details.
