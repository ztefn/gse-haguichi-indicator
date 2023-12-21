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

import * as Main          from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu     from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

const QuickSettingsMenu = Main.panel.statusArea.quickSettings;

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
const HaguichiIndicator = GObject.registerClass(class HaguichiIndicator extends QuickSettings.SystemIndicator {
    _init(path) {
        super._init();

        /**
         * Save the extension path needed when loading the status icons.
         */
        this.extensionPath = path;

        /**
         * Get the Haguichi session instance from the bus.
         */
        this.haguichiProxy = new HaguichiProxy(Gio.DBus.session, 'com.github.ztefn.haguichi', '/com/github/ztefn/haguichi');

        /**
         * Add the indicator and set initial icon.
         */
        this._indicator = this._addIndicator();
        this._setIcon('disconnected');

        /**
         * Define the standard icon.
         */
        let icon = this._getGIcon('connected');

        /**
         * Create the toggle button.
         */
        this._toggle = new HaguichiQuickMenuToggle();
        this._toggle.gicon = icon;
        this._toggle.menu.setHeader(icon, "Haguichi");
        this._toggle.connect('clicked', () => {
            if (this._toggle.toggle_mode) {
                this._toggle.checked ? this.haguichiProxy.StartHamachiRemote() : this.haguichiProxy.StopHamachiRemote()
            }
        });

        /**
         * Add the toggle button to the quick settings.
         */
        this.quickSettingsItems.push(this._toggle);

        /**
         * Create all menu items.
         */
        this.joinMenuItem   = new PopupMenu.PopupMenuItem(removeMnemonics(_("_Join Network…")));
        this.createMenuItem = new PopupMenu.PopupMenuItem(removeMnemonics(_("_Create Network…")));
        this.quitMenuItem   = new PopupMenu.PopupMenuItem(removeMnemonics(_("_Quit")));

        /**
         * Add the menu items to the popup menu.
         */
        this._toggle.menu.addMenuItem(this.joinMenuItem);
        this._toggle.menu.addMenuItem(this.createMenuItem);
        this._toggle.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._toggle.menu.addMenuItem(this.quitMenuItem);

        /**
         * Connect some actions to the menu items.
         */
        this.joinMenuItem.connect('activate', () => {
            presentWindow();
            this.haguichiProxy.JoinNetworkRemote();
        });
        this.createMenuItem.connect('activate', () => {
            presentWindow();
            this.haguichiProxy.CreateNetworkRemote();
        });
        this.quitMenuItem.connect('activate', () => {
            this.haguichiProxy.QuitAppRemote();
        });

        /**
         * Connect to the proxy signals so that we can update our state when changes occurs:
         * 1. Mode has changed
         * 2. Modal dialog is opened or closed
         * 3. Session has appeared or disappeared
         */
        modeChangedSignalId = this.haguichiProxy.connectSignal('ModeChanged', (proxy, sender, result) => {
            this._setMode(result[0]);
        });
        modalityChangedSignalId = this.haguichiProxy.connectSignal('ModalityChanged', (proxy, sender, result) => {
            this._setModality(result[0]);
        });
        ownerChangedSignalId = this.haguichiProxy.connect('notify::g-name-owner', () => {
            this._setIndicatorVisibility(this.haguichiProxy.get_name_owner() !== null);
        });

        /**
         * Retrieve the initial state to begin with:
         * 1. What mode are we currently in?
         * 2. Is there a modal dialog being shown?
         */
        this.haguichiProxy.GetModeRemote((result) => {
            let [mode] = result;
            this._setMode(mode);
        });
        this.haguichiProxy.GetModalityRemote((result) => {
            let [modal] = result;
            this._setModality(modal);
        });

        /**
         * Show indicator when a session is active.
         */
        this._setIndicatorVisibility(this.haguichiProxy.get_name_owner() !== null);

        /**
         * Connect to scroll events.
         */
        this._indicator.reactive = true;
        this._indicator.connect('scroll-event', this._onScrollEvent.bind(this));
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
        this._indicator.visible = visible;
        this._setMode(this.mode);
    }

    /**
     * This function disables all menu items except for "Quit" when a modal dialog is open.
     */
    _setModality(modal) {
        this.modal = modal;
        this._setMode(this.mode);
    }

    /**
     * This function saves the current mode and makes calls to set both the icon and toggle button into the requested mode.
     */
    _setMode(mode) {
        this._setIconMode(mode);
        this._setToggleMode(mode);

        this.mode = mode;
    }

    /**
     * This function makes the toggle button reflect the current mode Haguichi is in.
     */
    _setToggleMode(mode) {
        this._toggle.checked = ((mode == 'Connected') || (mode == 'Connecting'));
        this._toggle.toggle_mode = ((mode == 'Connected') || (mode == 'Disconnected'));
        this._toggle.visible = this._indicator.visible && ((mode == 'Connected') || (mode == 'Connecting') || (mode == 'Disconnected'));

        switch (mode) {
            case 'Connecting':
                this._toggle.subtitle = _("Connecting…");
                break;

            case 'Connected':
                this._toggle.subtitle = _("Connected");
                break;

            default:
                this._toggle.subtitle = _("Disconnected");
                break;
        }

        let sensitive = ((mode == 'Connected') && (this.modal !== true));

        this.joinMenuItem.sensitive = sensitive;
        this.createMenuItem.sensitive = sensitive;
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
        this._indicator.gicon = this._getGIcon(iconName);
    }

    /**
     * This function returns a GIcon based on icon name.
     */
    _getGIcon(iconName) {
        return Gio.icon_new_for_string(this.extensionPath + '/icons/haguichi-' + iconName + '-symbolic.svg');
    }

    /**
     * This function switches the icon when connecting.
     */
    _switchIcon() {
        if (this.mode !== 'Connecting') {
            sourceId = null;
            return GLib.SOURCE_REMOVE;
        }

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
 * Behold the Haguichi Quick Menu Toggle class.
 */
const HaguichiQuickMenuToggle = GObject.registerClass(class HaguichiQuickMenuToggle extends QuickSettings.QuickMenuToggle {
    _init() {
        super._init({
            title: "Haguichi",
            toggleMode: true,
            menuEnabled: true,
        });
    }
});

/**
 * This function hides the overview and closes quick settings when presenting the main window.
 * https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/45.0/js/ui/popupMenu.js#L584
 */
function presentWindow() {
    Main.overview.hide();
    Main.panel.closeQuickSettings();
}

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
 * Keep track of last signal ID's.
 */
let modeChangedSignalId     = null;
let modalityChangedSignalId = null;
let ownerChangedSignalId    = null;

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
        QuickSettingsMenu.addExternalIndicator(haguichiIndicator);
    }

    /**
     * This function is called by GNOME Shell to disable the extension.
     */
    disable() {
        if (modeChangedSignalId) {
            haguichiIndicator.haguichiProxy.disconnectSignal(modeChangedSignalId);
            modeChangedSignalId = null;
        }
        if (modalityChangedSignalId) {
            haguichiIndicator.haguichiProxy.disconnectSignal(modalityChangedSignalId);
            modalityChangedSignalId = null;
        }
        if (ownerChangedSignalId) {
            haguichiIndicator.haguichiProxy.disconnect(ownerChangedSignalId);
            ownerChangedSignalId = null;
        }

        haguichiIndicator.quickSettingsItems.forEach(item => item.destroy());
        haguichiIndicator.destroy();
        haguichiIndicator = null;

        if (sourceId) {
            GLib.Source.remove(sourceId);
            sourceId = null;
        }
    }
}
