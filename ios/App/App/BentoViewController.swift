import UIKit
import Capacitor

/// The app's one view controller. It exists only to register the local widget
/// plugin, since plugins inside the app target are not discovered automatically.
class BentoViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WidgetBridgePlugin())
    }
}
