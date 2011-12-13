/**
 * JSchema Event handler mixin
 *
 * A module that can be mixed in to *any object* in order to provide it with
 * custom events. addEvent() and removeEvent() are chainable.
 *
 * Event firing can be interrupted, like DOM events, by returning false from a
 * callback function. Subclasses can test whether the last event firing was
 * interrupted prematurely by checking the _lastEventCancelled property.
 *
 *		// using jQuery to illustrate 'extend'ing since this would be complex in pure js
 *		var object = {};
 *		$.extend(object, JSchema.EventHandler);
 *		object.addEvent('expand', function(){ alert('expanded'); });
 *		object.fireEvent('expand');
 *
 * @package	JSchema.Binding
 * @author	pospi	<pospi@spadgos.com>
 */

JSchema.EventHandler = {

	_callbacks : {},
	_lastEventCancelled : false,

	/**
	 * @param	string		ev			event name. Use "all" to bind to all events.
	 * @param	function	callback	callback function to bind to the event
	 * @param	object		context		object to bind the callback to
	 */
	addEvent : function(ev, callback, context)
	{
		var list  = this._callbacks[ev] || (this._callbacks[ev] = []);
		list.push([callback, context]);
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
		var calls,			// array of all registered callbacks
			list,			// current callback list for executing
			callback,		// current callback in the list being executed
			thisEvent,		// namespace components of current event being tested
			thisNamespace,	// current namespace component for checking
			matching,		// true if currently testing event should be fired
			i, j, l,
			args = Array.prototype.slice.call(arguments, 1),
			executions = false;	// return flag to specify whether callbacks were fired

		if (!(calls = this._callbacks)) return this;

		this._lastEventCancelled = false;

		// construct a regex to determine which event callbacks should be fired (child and all parents)
		eventName = eventName.split('.');

		for (var boundEvt in calls) {
			// if next deepest event namespace prevented bubbling, stop
			if (this._lastEventCancelled) {
				break;
			}

			// break the callback name registered here into namespaces
			thisEvent = boundEvt.split('.');
			matching = true;

			// determine whether the fired event matches
			for (j = 0, l = eventName.length; j < l && thisEvent.length; ++j) {
				thisNamespace = thisEvent.shift();
				if (thisNamespace == '?') {				// single level wildcard
					continue;
				} else if (thisNamespace == '*') {		// multilevel wildcard
					thisNamespace = thisEvent.shift();
					// ignore everything until we get a match for the next part
					while (thisNamespace != eventName[j + 1] && j + 1 < l) {
						j++;
					}
					if (j + 1 == l) {	// reached the end without matching
						matching = false;
						break;
					}
				} else if (thisNamespace != eventName[j]) {	// non-match
					matching = false;
					break;
				}
			}
			if (!matching || thisEvent.length) {	// namespace mismatch or callback was bound to a more specific event
				continue;		// :TODO: order them and make this break
			}

			// fire registered callbacks
			list = calls[boundEvt];
			for (i = 0, l = list.length; !this._lastEventCancelled && i < l; i++) {
				callback = list[i];
				executions = true;	// flag that callbacks were fired

				var retval = callback[0].apply(callback[1] || this, args);

				// check for a return value to prevent event bubbling
				if (retval === false) {
					this._lastEventCancelled = true;
					break;
				}
			}
		}
		return executions;
	}
};
