/**
 * JSchema Event handler mixin
 *
 * A module that can be mixed in to *any object* in order to provide it with
 * custom events. addEvent() and removeEvent() are chainable.
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
						list[i] = null;
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
	 * Callbacks bound to "all" are also passed the event name as the first argument.
	 *
	 * @return TRUE if some callbacks were executed or FALSE if nothing was listening to it
	 */
	fireEvent : function(eventName)
	{
		var list, calls, ev, callback, args, executions = false;
		var both = 2;
		if (!(calls = this._callbacks)) return this;
		while (both--) {
			ev = both ? eventName : 'all';
			if (list = calls[ev]) {
				for (var i = 0, l = list.length; i < l; i++) {
					if (!(callback = list[i])) {
						list.splice(i, 1); i--; l--;
					} else {
						args = both ? Array.prototype.slice.call(arguments, 1) : arguments;
						callback[0].apply(callback[1] || this, args);
						executions = true;
					}
				}
			}
		}
		return executions;
	}
};
