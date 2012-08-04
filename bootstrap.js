const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
Cu.import("resource://gre/modules/Services.jsm");

function install(data, reason) {
	ThreeFingerSwipe.install();
}

function uninstall(data, reason) {
	ThreeFingerSwipe.uninstall();
}

function startup(data, reason) {
	log("startup: " + data.id + ", " + reason);	// #debug
	// load into existing windows
	var winEnum = Services.wm.getEnumerator("navigator:browser");
	while (winEnum.hasMoreElements()) {
		var win = winEnum.getNext().QueryInterface(Ci.nsIDOMWindow);
		log("win: " + win);	// #debug
		ThreeFingerSwipe.init(win);
	}
	// load into new windows
	Services.wm.addListener(windowListener);
}

function shutdown(data, reason) {
	log("shutdown: " + data.id + ", " + reason);	// #debug
	if (reason == APP_SHUTDOWN)
		return;
	// stop listening for new windows
	Services.wm.removeListener(windowListener);
	// unload from existing windows
	var winEnum = Services.wm.getEnumerator("navigator:browser");
	while (winEnum.hasMoreElements()) {
		var win = winEnum.getNext().QueryInterface(Ci.nsIDOMWindow);
		ThreeFingerSwipe.uninit(win);
	}
}

var windowListener = {
	onOpenWindow: function(aWindow) {
		log("onOpenWindow: " + aWindow);	// #debug
		var win = aWindow.QueryInterface(Ci.nsIInterfaceRequestor).
		                  getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow);
		// wait for UIReady event to refer BrowserApp.deck in init
		win.addEventListener("UIReady", function(event) {
			log("UIReady: " + win);	// #debug
			win.removeEventListener("UIReady", arguments.callee, false);
			ThreeFingerSwipe.init(win);
		}, false);
	},
	onCloseWindow: function(aWindow) {},
	onWindowTitleChange: function(aWindow) {},
};

function log(aMessage) {
	Services.console.logStringMessage("threefingerswipe: " + aMessage);
}

function alert(aMessage) {
	Services.prompt.alert(null, "threefingerswipe", aMessage);
}

var ThreeFingerSwipe = {

	// how many fingers to be handled as a swipe gesture
	fingers: 3,

	// threshold distance in pixel to execute command
	threshold: 50,

	// the current ChromeWindow
	_window: null,

	// coordinate of the starting point of swipe gesture
	_baseX: 0,
	_baseY: 0,

	// a flag which indicates to keep on a swipe gesture
	_ongoing: false,

	// nsIStringBundle
	_bundle: null,

	// nsIPrefBranch
	_branch: null,

	// id of the menu item
	_menuId: 0,

	install: function() {
		// XXXset default prefs (since defaults/prefereces/prefs.js doesn't work...)
		// side effect: after updating the add-on, prefs will be reset to default.
		var branch = Services.prefs.getBranch("extensions.threefingerswipe.");
		branch.setCharPref("left", "prevtab");
		branch.setCharPref("right", "nexttab");
		branch.setCharPref("up", "blank");
		branch.setCharPref("down", "close");
	},

	uninstall: function() {
		// clear user prefs
		var branch = Services.prefs.getBranch("extensions.threefingerswipe.");
		branch.clearUserPref("left");
		branch.clearUserPref("right");
		branch.clearUserPref("up");
		branch.clearUserPref("down");
	},

	init: function(aWindow) {
		log("init: " + aWindow.location.href);	// #debug
		this._window = aWindow;
		this._branch = Services.prefs.getBranch("extensions.threefingerswipe.");
		// [debug]
		if (!aWindow.BrowserApp.deck) {
			alert("Error: BrowserApp.deck is null.");
			return;
		}
		aWindow.BrowserApp.deck.addEventListener("touchstart", this, false);
		aWindow.BrowserApp.deck.addEventListener("touchmove", this, false);
		// aWindow.BrowserApp.deck.addEventListener("touchend", this, false);
		// aWindow.BrowserApp.deck.addEventListener("touchcancel", this, false);
		// aWindow.BrowserApp.deck.addEventListener("touchleave", this, false);
		// add menu item
		this._menuId = aWindow.NativeWindow.menu.add(this._getString("name"), null, function() {
			ThreeFingerSwipe.config();
		});
	},

	uninit: function(aWindow) {
		log("uninit: " + aWindow.location.href);	// #debug
		// remove menu item
		if (this._menuId)
			aWindow.NativeWindow.menu.remove(this._menuId);
		this._window = null;
		this._bundle = null;
		this._branch = null;
		aWindow.BrowserApp.deck.removeEventListener("touchstart", this, false);
		aWindow.BrowserApp.deck.removeEventListener("touchmove", this, false);
		// aWindow.BrowserApp.deck.removeEventListener("touchend", this, false);
		// aWindow.BrowserApp.deck.removeEventListener("touchcancel", this, false);
		// aWindow.BrowserApp.deck.removeEventListener("touchleave", this, false);
	},

	handleEvent: function(event) {
		if (event.touches.length != this.fingers)
			return;
		// #debug-begin
		var msg = event.type + " ";
		for (var i = 0; i < this.fingers; i++) {
			var touch = event.touches.item(i);
			msg += "[" + touch.identifier + "] ";
			msg += touch.screenX + ", " + touch.screenY + " | ";
			msg += touch.clientX + ", " + touch.clientY + " ";
		}
		log(msg);
		// #debug-end
		// XXXhandle only the first finger
		var touch = event.touches.item(0);
		switch (event.type) {
			case "touchstart": 
				this._ongoing = true;
				this._baseX = touch.clientX;
				this._baseY = touch.clientY;
				break;
			case "touchmove": 
				if (!this._ongoing)
					return;
				var dx = touch.clientX - this._baseX;
				var dy = touch.clientY - this._baseY;
				log(event.type + ": " + dx + ", " + dy);	// #debug
				if (Math.abs(dx) > this.threshold || Math.abs(dy) > this.threshold) {
					this._ongoing = false;
					var direction = Math.abs(dx) > Math.abs(dy) ? 
					                (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
					// alert("direction: " + direction);
					var command = this._branch.getCharPref(direction);
					this._executeCommand(command, event.target.ownerDocument.defaultView);
				}
				break;
			default: 
		}
	},

	_executeCommand: function(aCommand, aDOMWindow) {
		var msg = "";
		var BrowserApp = this._window.BrowserApp;
		switch (aCommand) {
			case "back": 
				BrowserApp.selectedBrowser.goBack();
				break;
			case "forward": 
				BrowserApp.selectedBrowser.goForward();
				break;
			case "reload": 
				BrowserApp.selectedBrowser.reload();
				break;
			case "blank": 
				BrowserApp.addTab("about:blank");
				msg += " (" + BrowserApp.tabs.length + ")";
				break;
			case "close": 
				if (BrowserApp.tabs.length == 1)
					BrowserApp.loadURI("about:blank");
				else
					BrowserApp.closeTab(BrowserApp.selectedTab);
				msg += " (" + BrowserApp.tabs.length + ")";
				break;
			case "prevtab": 
			case "nexttab": 
				var curPos = BrowserApp.tabs.indexOf(BrowserApp.selectedTab);
				var maxPos = BrowserApp.tabs.length - 1;
				var newPos;
				if (aCommand == "prevtab")
					newPos = curPos - 1 >= 0 ? curPos - 1 : maxPos;
				else
					newPos = curPos + 1 <= maxPos ? curPos + 1 : 0;
				BrowserApp.selectTab(BrowserApp.tabs[newPos]);
				msg += " (" + ++newPos + "/" + ++maxPos + ")";
				break;
			case "search": 
				var ret = { value: "" };
				var ok = Services.prompt.prompt(null, this._getString("search"), 
				                                this._getString("search.enter"), ret, null, {});
				if (!ok || !ret.value)
					return;
				var engine = Services.search.currentEngine;
				var submission = engine.getSubmission(ret.value);
				var tab = BrowserApp.addTab("about:blank");
				tab.browser.loadURI(submission.uri.spec, null, null, null, submission.postData);
				msg += " (" + ret.value + ")";
				break;
			default: 
				alert("Error: unknown command: " + aCommand);
				return;
		}
		this._window.NativeWindow.toast.show(this._getString(aCommand) + msg, "short");
	},

	config: function() {
		var title = this._getString("name") + " - " + this._getString("config");
		// 1. direction
		var directions = ["left", "right", "up", "down"];
		var ret = {};
		Services.prompt.select(
			null, title, this._getString("config.direction"), directions.length, 
			directions.map(function(dir) ThreeFingerSwipe._getString(dir)), ret
		);
		var direction = directions[ret.value];
		// 2. command
		var commands = ["back", "forward", "reload", "blank", "close", 
		                "prevtab", "nexttab", "search"];
		// sort the commands to select the current command by default
		var command = this._branch.getCharPref(direction);
		commands.splice(commands.indexOf(command), 1);
		commands.unshift(command);
		var ret = {};
		Services.prompt.select(
			null, title, this._getString("config.command"), commands.length, 
			commands.map(function(cmd) ThreeFingerSwipe._getString(cmd)), ret
		);
		command = commands[ret.value];
		// 3. update the pref
		this._branch.setCharPref(direction, command);
		// get the new value of the pref
		command = this._branch.getCharPref(direction);
		var msg = this._getString("config.done") + "\n\n" + 
		          this._getString(direction) + " : " + this._getString(command);
		Services.prompt.alert(null, title, msg);
	},

	_getString: function(aName) {
		if (!this._bundle) {
			var uri = "chrome://threefingerswipe/locale/main.properties";
			this._bundle = Services.strings.createBundle(uri);
		}
		try {
			return this._bundle.GetStringFromName(aName);
		}
		catch (ex) {
			return aName;
		}
	},

};

