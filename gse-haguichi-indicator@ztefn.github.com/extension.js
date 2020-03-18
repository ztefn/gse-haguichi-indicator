/**
    Haguichi Indicator for GNOME Shell
    Copyright (C) 2016-2018 Stephen Brandt <stephen@stephenbrandt.com>

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
**/

const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Lang = imports.lang;
const Gio = imports.gi.Gio;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Gettext = imports.gettext.domain('haguichi');
const _ = Gettext.gettext;

const Me = imports.misc.extensionUtils.getCurrentExtension();

/**
 * This is the D-Bus interface as XML and can be acquired by executing the following command:
 * dbus-send --session --print-reply --dest=com.github.ztefn.haguichi /com/github/ztefn/haguichi org.freedesktop.DBus.Introspectable.Introspect
 */
const HaguichiInterface = '<node>\
  <interface name="com.github.ztefn.haguichi">\
    <method name="Show">\
    </method>\
    <method name="Hide">\
    </method>\
    <method name="StartHamachi">\
    </method>\
    <method name="StopHamachi">\
    </method>\
    <method name="ChangeNick">\
    </method>\
    <method name="JoinNetwork">\
    </method>\
    <method name="CreateNetwork">\
    </method>\
    <method name="Information">\
    </method>\
    <method name="Preferences">\
    </method>\
    <method name="About">\
    </method>\
    <method name="QuitApp">\
    </method>\
    <method name="GetMode">\
      <arg type="s" name="result" direction="out"/>\
    </method>\
    <method name="GetModality">\
      <arg type="b" name="result" direction="out"/>\
    </method>\
    <method name="GetVisibility">\
      <arg type="b" name="result" direction="out"/>\
    </method>\
    <signal name="ModeChanged">\
      <arg type="s" name="mode"/>\
    </signal>\
    <signal name="ModalityChanged">\
      <arg type="b" name="modal"/>\
    </signal>\
    <signal name="VisibilityChanged">\
      <arg type="b" name="visible"/>\
    </signal>\
    <signal name="Quitted">\
    </signal>\
  </interface>\
</node>';

/**
 * Declare the proxy class based on the interface.
 */
const HaguichiProxy = Gio.DBusProxy.makeProxyWrapper(HaguichiInterface);

/**
 * Behold the Haguichi Indicator class.
 */
const HaguichiIndicator = new Lang.Class({
    Name: 'HaguichiIndicator',
    Extends: PanelMenu.Button,

    _init: function() {
        this.parent(0.0, 'HaguichiIndicator');

        /**
         * Get the Haguichi session instance from the bus.
         */
        this.haguichiProxy = new HaguichiProxy(Gio.DBus.session, 'com.github.ztefn.haguichi', '/com/github/ztefn/haguichi');

        /**
         * Construct the status icon and add it to the panel.
         */
        this.statusIcon = new St.Icon({ style_class: 'system-status-icon' });
        this._setIcon('disconnected');

        this.box = new St.BoxLayout({ style_class: 'panel-status-menu-box' });
        this.box.add_actor(this.statusIcon);

        this.add_child(this.box);

        /**
         * Create all menu items.
         */
        this.showMenuItem       = new PopupMenu.PopupMenuItem(removeMnemonics(_("_Show Haguichi")));
        this.connectingMenuItem = new PopupMenu.PopupMenuItem(removeMnemonics(_("Connecting…")).replace ('…', ''));
        this.connectMenuItem    = new PopupMenu.PopupMenuItem(removeMnemonics(_("C_onnect")));
        this.disconnectMenuItem = new PopupMenu.PopupMenuItem(removeMnemonics(_("_Disconnect")));
        this.joinMenuItem       = new PopupMenu.PopupMenuItem(removeMnemonics(_("_Join Network…")));
        this.createMenuItem     = new PopupMenu.PopupMenuItem(removeMnemonics(_("_Create Network…")));
        this.infoMenuItem       = new PopupMenu.PopupMenuItem(removeMnemonics(_("_Information")));
        this.quitMenuItem       = new PopupMenu.PopupMenuItem(removeMnemonics(_("_Quit")));

        /**
         * Add the menu items and some separators to the popup menu.
         */
        this.menu.addMenuItem(this.showMenuItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addMenuItem(this.connectingMenuItem);
        this.menu.addMenuItem(this.connectMenuItem);
        this.menu.addMenuItem(this.disconnectMenuItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addMenuItem(this.joinMenuItem);
        this.menu.addMenuItem(this.createMenuItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addMenuItem(this.infoMenuItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addMenuItem(this.quitMenuItem);

        /**
         * Connect some actions to the menu items.
         */
        this.showMenuItem.connect('activate', Lang.bind(this, function() {
            if (this.showMenuItem._ornament == PopupMenu.Ornament.CHECK) {
                this.haguichiProxy.HideRemote();
            }
            else {
                this.haguichiProxy.ShowRemote();
            }
        }));
        this.connectMenuItem.connect('activate', Lang.bind(this, function() {
            this.haguichiProxy.StartHamachiRemote();
        }));
        this.disconnectMenuItem.connect('activate', Lang.bind(this, function() {
            this.haguichiProxy.StopHamachiRemote();
        }));
        this.joinMenuItem.connect('activate', Lang.bind(this, function() {
            this.haguichiProxy.JoinNetworkRemote();
        }));
        this.createMenuItem.connect('activate', Lang.bind(this, function() {
            this.haguichiProxy.CreateNetworkRemote();
        }));
        this.infoMenuItem.connect('activate', Lang.bind(this, function() {
            this.haguichiProxy.InformationRemote();
        }));
        this.quitMenuItem.connect('activate', Lang.bind(this, function() {
            this.haguichiProxy.QuitAppRemote();
        }));

        /**
         * Connect to the proxy signals so that we can update our state when changes occurs:
         * 1. Mode has changed
         * 2. Modal dialog is opened or closed
         * 3. Main window is shown or hidden
         * 4. Haguichi session has appeared or disappeared
         */
        this.haguichiProxy.connectSignal('ModeChanged', Lang.bind(this, function(proxy, sender, result) {
            this._setMode(result[0]);
        }));
        this.haguichiProxy.connectSignal('ModalityChanged', Lang.bind(this, function(proxy, sender, result) {
            this._setModality(result[0]);
        }));
        this.haguichiProxy.connectSignal('VisibilityChanged', Lang.bind(this, function(proxy, sender, result) {
            this._setAppVisibility(result[0]);
        }));
        this.haguichiProxy.connect('notify::g-name-owner', Lang.bind(this, function() {
            this._setIndicatorVisibility(this.haguichiProxy.get_name_owner() !== null);
        }));

        /**
         * Retrieve the initial state to begin with:
         * 1. What mode are we currently in?
         * 2. Is there a modal dialog being shown?
         * 3. Is the main window visible or not?
         */
        this.haguichiProxy.GetModeRemote(Lang.bind(this, function(result) {
            let [mode] = result;
            this._setMode(mode);
        }));
        this.haguichiProxy.GetModalityRemote(Lang.bind(this, function(result) {
            let [modal] = result;
            this._setModality(modal);
        }));
        this.haguichiProxy.GetVisibilityRemote(Lang.bind(this, function(result) {
            let [visible] = result;
            this._setAppVisibility(visible);
        }));

        /**
         * Show indicator when a session is active.
         */
        this._setIndicatorVisibility(this.haguichiProxy.get_name_owner() !== null);

        /**
         * Connect to scroll events.
         */
        this.connect('scroll-event', Lang.bind(this, this._onScrollEvent));
    },

    /**
     * This function shows the main window when scrolling up and hides it when scrolling down.
     */
    _onScrollEvent: function(actor, event) {
        if (this.modal == true)
            return;

        switch (event.get_scroll_direction()) {
            case Clutter.ScrollDirection.UP:
                this.haguichiProxy.ShowRemote();
                break;

            case Clutter.ScrollDirection.DOWN:
                this.haguichiProxy.HideRemote();
                break;
        }
    },

    /**
     * This function shows or hides the indicator.
     */
    _setIndicatorVisibility: function(visible) {
        this.visible = visible;
    },

    /**
     * This function adds or removes the checkmark for the "Show Haguichi" menu item.
     */
    _setAppVisibility: function(visible) {
        this.showMenuItem.setOrnament((visible == true) ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
    },

    /**
     * This function disables all menu items except for "Quit" when a modal dialog is open.
     */
    _setModality: function(modal) {
        this.modal = modal;
        this._setMode(this.mode);
    },

    /**
     * This function saves the current mode and makes calls to set both the icon and menu into the requested mode.
     */
    _setMode: function(mode) {
        this._setIconMode(mode);
        this._setMenuMode(mode);

        this.mode = mode;
    },

    /**
     * This function makes every menu item reflect the current mode Haguichi is in.
     */
    _setMenuMode: function(mode) {
        switch (mode) {
            case 'Connecting':
                this.connectingMenuItem.setSensitive(false);
                this.connectingMenuItem.visible = true;
                this.connectMenuItem.visible = false;
                this.disconnectMenuItem.visible = false;
                this.joinMenuItem.setSensitive(false);
                this.createMenuItem.setSensitive(false);
                this.infoMenuItem.setSensitive(true);
                break;

            case 'Connected':
                this.connectingMenuItem.visible = false;
                this.connectMenuItem.visible = false;
                this.disconnectMenuItem.setSensitive(true);
                this.disconnectMenuItem.visible = true;
                this.joinMenuItem.setSensitive(true);
                this.createMenuItem.setSensitive(true);
                this.infoMenuItem.setSensitive(true);
                break;

            case 'Disconnected':
                this.connectingMenuItem.visible = false;
                this.connectMenuItem.setSensitive(true);
                this.connectMenuItem.visible = true;
                this.disconnectMenuItem.visible = false;
                this.joinMenuItem.setSensitive(false);
                this.createMenuItem.setSensitive(false);
                this.infoMenuItem.setSensitive(true);
                break;

            default:
                this.connectingMenuItem.visible = false;
                this.connectMenuItem.setSensitive(false);
                this.connectMenuItem.visible = true;
                this.disconnectMenuItem.visible = false;
                this.joinMenuItem.setSensitive(false);
                this.createMenuItem.setSensitive(false);
                this.infoMenuItem.setSensitive(false);
                break;
        }

        if (this.modal) {
            this.showMenuItem.setSensitive(false);
            this.connectMenuItem.setSensitive(false);
            this.disconnectMenuItem.setSensitive(false);
            this.joinMenuItem.setSensitive(false);
            this.createMenuItem.setSensitive(false);
            this.infoMenuItem.setSensitive(false);
        }
        else {
            this.showMenuItem.setSensitive(true);
        }
    },

    /**
     * This function makes the status icon reflect the current mode Haguichi is in.
     */
    _setIconMode: function(mode) {
        /**
         * Check if there isn't already an animation going on when connecting.
         */
        if ((mode == 'Connecting') && (this.iconName.indexOf('connecting') !== -1))
            return;

        this.iconNum = 0;

        switch (mode) {
            case 'Connecting':
                Mainloop.timeout_add(400, Lang.bind(this, this._switchIcon))
                break;

            case 'Connected':
                this._setIcon('connected');
                break;

            default:
                this._setIcon('disconnected');
                break;
        }
    },

    /**
     * This function sets the status icon.
     */
    _setIcon: function(iconName) {
        this.iconName = iconName;
        this.statusIcon.gicon = Gio.icon_new_for_string(Me.path + '/icons/haguichi-' + iconName +'-symbolic.svg');
    },

    /**
     * This function switches the icon when connecting.
     */
    _switchIcon: function() {
        if (this.mode !== 'Connecting')
            return false;

        if (this.iconNum == 0) {
            this._setIcon('connecting-1');
            this.iconNum = 1;
        }
        else if (this.iconNum == 1) {
            this._setIcon('connecting-2');
            this.iconNum = 2;
        }
        else {
            this._setIcon('connecting-3');
            this.iconNum = 0;
        }
        return true;
    }
});

/**
 * GNOME Shell doesn't support keyboard mnemonics so this function strips out any of them:
 * 1. For Japanese in the form of underscore and letter within parentheses, i.e. "ラベル(_L)"
 * 2. For all other languages in the form of plain underscores, i.e. "_Label"
 */
function removeMnemonics(label) {
    return label.replace(/\(_[a-zA-Z]\)/, '').replace('_', '');
}

/**
 * This is our Haguichi Indicator instance.
 */
let haguichiIndicator;

/**
 * This function is called by GNOME Shell to enable the extension.
 */
function enable() {
    haguichiIndicator = new HaguichiIndicator();
    Main.panel.addToStatusArea('haguichi-indicator', haguichiIndicator);
}

/**
 * This function is called by GNOME Shell to disable the extension.
 */
function disable() {
    haguichiIndicator.destroy();
}
