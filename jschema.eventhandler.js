/**
 * JSchema Event handler mixin
 *
 * A module that can be mixed in to *any object* in order to provide it with
 * custom events. addEvent() and removeEvent() are chainable.
 *
 * The event model is based upon namespacing, which allow binding to events of any
 * specifity along a period-separated chain - I believe this is similar to jQuery
 * event namespaces, though i've no idea whether theirs allows further depth levels.
 * In addition, namespaces can be substituted with the wildcards ? and * to match
 * arbitrary namespaces at particular depths. The best way to illustrate a real use-case
 * of this is by example:
 *
 * 		// Create an object, and initialise an event handler on it
 *		// Using jQuery to illustrate 'extend'ing since this would be complex in pure js
 *		var object = {
 *			A : {
 *				AA : 'foo'
 *			}, B : {
 *				AA : 'foo'
 *			}
 *		};
 *		$.extend(object, JSchema.EventHandler);
 *
 *		// We can add a callback to do something when the object is modified...
 *		object.addEvent('change', function(){ console.log('The object was modified'); });
 *		// ..or when the object is modified as a result of being created...
 *		object.addEvent('change.create', function(){ console.log('The object was created'); });
 *		// ..or when being updated or deleted...
 *		object.addEvent('change.update', function(){ console.log('The object was updated'); });
 *		object.addEvent('change.delete', function(){ console.log('The object was deleted'); });
 *		// ..or when a particular property is updated...
 *		object.addEvent('change.update.A', function(){ console.log('A updated'); });
 *		object.addEvent('change.update.B', function(){ console.log('B updated'); });
 *		// ..or a property of a property...
 *		object.addEvent('change.update.A.AA', function(){ console.log('A.AA updated'); });
 *		object.addEvent('change.update.B.AA', function(){ console.log('B.AA updated'); });
 *		// ..or when something is deleted.
 *		object.addEvent('change.delete.A.AA', function(){ console.log('A.AA deleted'); });
 *		// We can also bind to any modification (create, update or delete) of properties via:
 *		object.addEvent('change.?.A', function(){ console.log('A modified'); });
 *		object.addEvent('change.?.A.AA', function(){ console.log('A.AA modified'); });
 *		// And finally, any modification to *any* subproperty AA could be expressed as:
 *  	object.addEvent('change.*.AA', function(){ console.log('*.AA modified'); });
 *
 *  	// This would normally happen from your own code, but you would fire
 *  	// events as follows...
 *
 *		// When we fire a change event, only the top-level callbacks will fire...
 *		object.fireEvent('change');
 *			>> The object was modified
 *		// But we can also fire an event when a particular property is updated,
 *		// for the following event chain to fire (as bound):
 *		object.fireEvent('change.update.A.AA');
 *			>> A.AA updated				<- specific update event for this property
 *			>> A.AA modified			<- ? wildcard change event for this property
 *			>> A updated				<- update event for parent property...
 *			>> A modified
 *			>> *.AA modified			<- * wildcard property update
 *			>> The object was updated	<- nonspecific update event
 *			>> The object was modified	<- top-level modification event
 *
 * Event firing can be interrupted, like DOM events, by returning false from a
 * callback function. Subclasses can test whether the last event firing was
 * interrupted prematurely by checking the _lastEventCancelled property.
 *
 * @package	JSchema.Binding
 * @author	pospi	<pospi@spadgos.com>
 */

JSchema.EventHandler = {

	_callbacks : {},
	_lastEventCancelled : false,
	_marshalling : false,
	_inMarshalling : false,
	_marshalledEvents : {},
	_marshallEventStack : {},

	/**
	 * @param	string		ev			event name. Use "all" to bind to all events.
	 * @param	function	callback	callback function to bind to the event
	 * @param	object		context		object to bind the callback to
	 */
	addEvent : function(ev, callback, context)
	{
		if (typeof this._callbacks[ev] == 'undefined') {
			this._callbacks[ev] = [];
			this._callbacks = this._resortCallbacks(this._callbacks);
		}
		var list = this._callbacks[ev];
		list.push([callback, context]);
		return this;
	},

	/**
	 * Add a list of event callbacks
	 * @param {object} events an object containing event names as keys, and callback
	 *                        functions or arrays of functions & contexts as values
	 */
	addEvents : function(events)
	{
		// preconvert into arrays
		var cb;
		for (var e in events) {
			if (typeof events[e] == 'function') {
				events[e] = [[events[e], undefined]];
			} else {	// assume an array with function context at element 1
				events[e] = [events[e]];
			}
		}

		JSchema.extendAndUnset(this._callbacks, events);
		this._callbacks = this._resortCallbacks(this._callbacks);

		return this;
	},

	/**
	 * @param	string		ev			event name. If null, all callbacks are removed.
	 * @param	function	callback	callback function to remove for this event type. If null, all callbacks for this event are released.
	 */
	removeEvent : function(ev, callback)
	{
		var calls;
		if (!ev) {
			this._callbacks = {};
		} else if (calls = this._callbacks) {
			if (!callback) {
				calls[ev] = [];
			} else {
				var list = calls[ev];
				if (!list) return this;
				for (var i = 0, l = list.length; i < l; i++) {
					if (list[i] && callback === list[i][0]) {
						list.splice(i, 1);
						break;
					}
				}
			}
		}
		return this;
	},

	/**
	 * Trigger an event, firing all bound callbacks. Callbacks are passed all arguments
	 * to this function following the eventname.
	 *
	 * @return TRUE if some callbacks were executed or FALSE if nothing was listening to it
	 */
	fireEvent : function(eventName)
	{
		var args = Array.prototype.slice.call(arguments, 1);

		if (this._marshalling) {
			if (typeof this._marshalledEvents[eventName] == 'undefined') {
				this._marshalledEvents[eventName] = [];
			}
			this._marshalledEvents[eventName].push([args, undefined]);
			return true;	// :TODO: yeah, we *kinda* fired it...
		}

		if (!(this._callbacks)) return false;

		return this._processEventCallbacks(eventName, args, this._getEventCallbacks());
	},

	/**
	 * Event marshalling - begin collecting fired events in order to fire
	 * them simultaneously sometime later without re-firing callbacks
	 * from overlapping namespaces.
	 */
	holdEvents : function()
	{
		this._marshalling = true;
	},

	/**
	 * Fire all events deferred as a result of marshalling. Return TRUE/FALSE
	 * depending on whether callbacks were run as with fireEvent().
	 */
	fireHeldEvents : function()
	{
		this._marshalling = false;
		this._inMarshalling = true;

		if (!(this._callbacks)) return false;

		var calls = this._getEventCallbacks(),
			fired = false,
			list,
			currEvent;

		// first, order the marshalled events by specifity to order bubbling correctly
		this._marshalledEvents = this._resortCallbacks(this._marshalledEvents);
		this._marshallEventStack = {};

		this._lastEventCancelled = false;

		// accumulate all fired callbacks in sequence. Higher-order callbacks
		// will naturally override low-ordered ones.
		for (currEvent in this._marshalledEvents) {
			if (this._lastEventCancelled) {
				break;
			}

			list = this._marshalledEvents[currEvent];
			for (i = 0, l = list.length; i < l; ++i) {
				if ( this._processEventCallbacks(currEvent, list[i][0], calls) ) {
					fired = true;
				}
			}
			this._marshalledEvents[currEvent] = null;	// flag as fired
		}

		// fire the final, most appropriate, set of callbacks
		this._marshallEventStack = this._resortCallbacks(this._marshallEventStack);
		for (var cb in this._marshallEventStack) {
			if (this._lastEventCancelled) {
				break;
			}
			if (this._fireCallbacks(this._marshallEventStack[cb][0], this._marshallEventStack[cb][1])) {
				fired = true;
			}
		}

		this._marshalledEvents = {};
		this._inMarshalling = false;
		return fired;
	},

	/**
	 * Trash events accumulated while marshalling
	 */
	abortHeldEvents : function()
	{
		this._marshalledEvents = {};
		this._marshalling = false;
	},

	/**
	 * Returns a shallow copy of our own callback register for processing
	 * @return {object}
	 */
	_getEventCallbacks : function()
	{
		var calls = {},
			cb,
			callback;
		for (cb in this._callbacks) {
			calls[cb] = this._callbacks[cb];
		}
		return calls;
	},

	/**
	 * Process an event name and arguments against an associative array of callbacks.
	 * Callback references are removed after running so that no two of the same event
	 * will fire during one event pass - you can use this property with a steadily declining
	 * array of callbacks to fire multiple events as part of the one logical 'change'.
	 * @param  {string} eventName event to fire
	 * @param  {array}  args      arguments to the event's callbacks
	 * @param  {object} calls     object mapping callback functions to event names. Events
	 *                            fired will be removed from this object after processing.
	 * @return {boolean}  a flag indicating whether callbacks were fired
	 */
	_processEventCallbacks : function(eventName, args, calls)
	{
		var list,				// current callback list for executing
			executions = false;	// return flag to specify whether callbacks were fired

		this._lastEventCancelled = false;

		// construct a regex to determine which event callbacks should be fired (child and all parents)
		var firedEvent = eventName.split('.');

		for (var boundEvt in calls) {
			// if next deepest event namespace prevented bubbling, stop
			if (this._lastEventCancelled) {
				break;
			}

			// bail early if the callback has already been fired
			if (!(list = calls[boundEvt])) {
				continue;
			}

			// determine whether the fired event matches us
			if (!this._eventMatches(firedEvent, boundEvt.split('.'))) {
				continue;		// :TODO: order them and make this break
			}

			// if we are marshalling, store the callback list for firing later.
			// this allows higher-order callbacks bound to the same event to
			// override (:TODO: should they append?) their more specific parameters
			if (this._inMarshalling) {
				this._marshallEventStack[boundEvt] = [list, args];
				continue;
			}

			// otherwise, fire the registered callbacks
			if (this._fireCallbacks(list, args)) {
				executions = true;
			}
		}
		return executions;
	},

	/**
	 * Execute all callbacks in an array and return true if any were fired
	 */
	_fireCallbacks : function(list, args)
	{
		var callback,
			executions = false;

		for (var i = 0, l = list.length; i < l; i++) {
			if (!(callback = list[i])) {
				// this can happen when running marshalled callbacks
				continue;
			}
			executions = true;	// flag that callbacks were fired

			var retval = callback[0].apply(callback[1] || this, args);

			// check for a return value to prevent event bubbling up to the
			// next callback
			if (retval === false) {
				this._lastEventCancelled = true;
			}
		}

		return executions;
	},

	/**
	 * Test whether an ordered array of event namespaces should cause
	 * another array of event namespaces to run their callbacks
	 * @param  {array} firedEvent array of event namespaces being fired
	 * @param  {array} cbEvent    array of event namespaces being tested / bound callback namespaces
	 * @return {bool}
	 */
	_eventMatches : function(firedEvent, cbEvent)
	{
		var thisNamespace,
			j, l;

		for (j = 0, l = firedEvent.length; j < l && cbEvent.length; ++j) {
			thisNamespace = cbEvent.shift();
			if (thisNamespace == '?') {				// single level wildcard
				continue;
			} else if (thisNamespace == '*') {		// multilevel wildcard
				thisNamespace = cbEvent.shift();
				// ignore everything until we get a match for the next part
				while (thisNamespace != firedEvent[j + 1] && j + 1 < l) {
					j++;
				}
				if (j + 1 == l) {	// reached the end without matching
					return false;
				}
			} else if (thisNamespace != firedEvent[j]) {	// non-match
				return false;
			}
		}
		// any remaining namespaces in the callback means callback was bound to a more specific event
		return cbEvent.length == 0;
	},

	/**
	 * Reorders the callbacks array into the order they should be fired in (more
	 * specific first). This allows us to break callback iteration when a callback
	 * returns false and prevents bubbling.
	 */
	_resortCallbacks : function(callbacks)
	{
		// grab all the callback names currently stored
		var callbackNames = [],
			orderedCallbacks = {},
			cb, i, l;

		for (cb in callbacks) {
			callbackNames.push(cb);
		}

		// sort the array of callback names
		callbackNames.sort(function(a, b) {
			if (a == b) {	// exactly equal if keys are a string match
				return 0;
			}

			var aa = a.split('.'),
				ab = b.split('.'),
				nextA, nextB;
			if (aa.length != ab.length) {
				return aa.length > ab.length ? -1 : 1;	// put longest one first if length mismatch
			}
			// otherwise go through both namespace arrays until we don't match or reach the end
			while (aa.length && ab.length && nextA == nextB) {
				nextA = aa.shift();
				nextB = ab.shift();
			}
			if (nextA == '*' || (nextA == '?' && nextB != '*')) {
				return 1;		// a was a lower-priority wildcard, put b first
			}
			if (nextB == '*' || (nextB == '?' && nextA != '*')) {
				return -1;		// b was a lower-priority wildcard, put a first
			}
			return nextA < nextB ? -1 : 1;
		});

		// loop back over in them in the new order and reassign
		for (i = 0, l = callbackNames.length; i < l; ++i) {
			orderedCallbacks[callbackNames[i]] = callbacks[callbackNames[i]];
		}

		return orderedCallbacks;
	}
};
