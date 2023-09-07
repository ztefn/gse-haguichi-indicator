/**
    Haguichi Indicator for GNOME Shell
    Copyright (C) 2016-2023 Stephen Brandt <stephen@stephenbrandt.com>

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

import Clutter from 'gi://Clutter';
import Gio     from 'gi://Gio';
import GLib    from 'gi://GLib';
import GObject from 'gi://GObject';
import St      from 'gi://St';

import * as Main      from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

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
const HaguichiIndicator = GObject.registerClass(class HaguichiIndicator extends PanelMenu.Button {
    _init(path) {
        super._init(0.5, 'Haguichi Indicator');

        /**
         * Save the extension path needed when loading the status icons.
         */
        this.extensionPath = path;

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
        this.showMenuItem.connect('activate', () => {
            if (this.showMenuItem._ornament == PopupMenu.Ornament.CHECK) {
                this.haguichiProxy.HideRemote();
            }
            else {
                this.haguichiProxy.ShowRemote();
            }
        });
        this.connectMenuItem.connect('activate', () => {
            this.haguichiProxy.StartHamachiRemote();
        });
        this.disconnectMenuItem.connect('activate', () => {
            this.haguichiProxy.StopHamachiRemote();
        });
        this.joinMenuItem.connect('activate', () => {
            this.haguichiProxy.JoinNetworkRemote();
        });
        this.createMenuItem.connect('activate', () => {
            this.haguichiProxy.CreateNetworkRemote();
        });
        this.infoMenuItem.connect('activate', () => {
            this.haguichiProxy.InformationRemote();
        });
        this.quitMenuItem.connect('activate', () => {
            this.haguichiProxy.QuitAppRemote();
        });

        /**
         * Connect to the proxy signals so that we can update our state when changes occurs:
         * 1. Mode has changed
         * 2. Modal dialog is opened or closed
         * 3. Main window is shown or hidden
         * 4. Haguichi session has appeared or disappeared
         */
        this.haguichiProxy.connectSignal('ModeChanged', (proxy, sender, result) => {
            this._setMode(result[0]);
        });
        this.haguichiProxy.connectSignal('ModalityChanged', (proxy, sender, result) => {
            this._setModality(result[0]);
        });
        this.haguichiProxy.connectSignal('VisibilityChanged', (proxy, sender, result) => {
            this._setAppVisibility(result[0]);
        });
        this.haguichiProxy.connect('notify::g-name-owner', () => {
            this._setIndicatorVisibility(this.haguichiProxy.get_name_owner() !== null);
        });

        /**
         * Retrieve the initial state to begin with:
         * 1. What mode are we currently in?
         * 2. Is there a modal dialog being shown?
         * 3. Is the main window visible or not?
         */
        this.haguichiProxy.GetModeRemote((result) => {
            let [mode] = result;
            this._setMode(mode);
        });
        this.haguichiProxy.GetModalityRemote((result) => {
            let [modal] = result;
            this._setModality(modal);
        });
        this.haguichiProxy.GetVisibilityRemote((result) => {
            let [visible] = result;
            this._setAppVisibility(visible);
        });

        /**
         * Show indicator when a session is active.
         */
        this._setIndicatorVisibility(this.haguichiProxy.get_name_owner() !== null);

        /**
         * Connect to scroll events.
         */
        this.connect('scroll-event', this._onScrollEvent.bind(this));
    }

    /**
     * This function shows the main window when scrolling up and hides it when scrolling down.
     */
    _onScrollEvent(actor, event) {
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
    }

    /**
     * This function shows or hides the indicator.
     */
    _setIndicatorVisibility(visible) {
        this.visible = visible;
    }

    /**
     * This function adds or removes the checkmark for the "Show Haguichi" menu item.
     */
    _setAppVisibility(visible) {
        this.showMenuItem.setOrnament((visible == true) ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
    }

    /**
     * This function disables all menu items except for "Quit" when a modal dialog is open.
     */
    _setModality(modal) {
        this.modal = modal;
        this._setMode(this.mode);
    }

    /**
     * This function saves the current mode and makes calls to set both the icon and menu into the requested mode.
     */
    _setMode(mode) {
        this._setIconMode(mode);
        this._setMenuMode(mode);

        this.mode = mode;
    }

    /**
     * This function makes every menu item reflect the current mode Haguichi is in.
     */
    _setMenuMode(mode) {
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
    }

    /**
     * This function makes the status icon reflect the current mode Haguichi is in.
     */
    _setIconMode(mode) {
        /**
         * Check if there isn't already an animation going on when connecting.
         */
        if ((mode == 'Connecting') && (this.iconName.indexOf('connecting') !== -1))
            return;

        this.iconNum = 0;

        switch (mode) {
            case 'Connecting':
                sourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, this._switchIcon.bind(this));
                break;

            case 'Connected':
                this._setIcon('connected');
                break;

            default:
                this._setIcon('disconnected');
                break;
        }
    }

    /**
     * This function sets the status icon.
     */
    _setIcon(iconName) {
        this.iconName = iconName;
        this.statusIcon.gicon = Gio.icon_new_for_string(this.extensionPath + '/icons/haguichi-' + iconName + '-symbolic.svg');
    }

    /**
     * This function switches the icon when connecting.
     */
    _switchIcon() {
        if (this.mode !== 'Connecting')
            return GLib.SOURCE_REMOVE;

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
        return GLib.SOURCE_CONTINUE;
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
 * Keep track of last event source ID.
 */
let sourceId = null;

/**
 * This is our Haguichi Indicator instance.
 */
let haguichiIndicator;

export default class HaguichiIndicatorExtension extends Extension {
    /**
     * This function is called by GNOME Shell to enable the extension.
     */
    enable() {
        haguichiIndicator = new HaguichiIndicator(this.path);
        Main.panel.addToStatusArea('haguichi-indicator', haguichiIndicator);
    }

    /**
     * This function is called by GNOME Shell to disable the extension.
     */
    disable() {
        haguichiIndicator.destroy();
        haguichiIndicator = null;

        if (sourceId) {
            GLib.Source.remove(sourceId);
            sourceId = null;
        }
    }
}
