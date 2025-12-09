/**
 * /!\ This file is auto-generated.
 *
 * This is the entry point of your standalone application.
 *
 * There are multiple tags used by the editor to inject code automatically:
 *     - `wle:auto-imports:start` and `wle:auto-imports:end`: The list of import statements
 *     - `wle:auto-register:start` and `wle:auto-register:end`: The list of component to register
 */

/* wle:auto-imports:start */
import {Cursor} from '@wonderlandengine/components';
import {HowlerAudioListener} from '@wonderlandengine/components';
import {MouseLookComponent} from '@wonderlandengine/components';
import {PlayerHeight} from '@wonderlandengine/components';
import {ActiveCamera} from 'wle-interaction';
import {ControlsVR} from 'wle-interaction';
import {DefaultInputBridge} from 'wle-interaction';
import {GrabPoint} from 'wle-interaction';
import {Grabbable} from 'wle-interaction';
import {Interactor} from 'wle-interaction';
import {PlayerController} from 'wle-interaction';
import {PlayerRotate} from 'wle-interaction';
/* wle:auto-imports:end */

export default function(engine) {
/* wle:auto-register:start */
engine.registerComponent(Cursor);
engine.registerComponent(HowlerAudioListener);
engine.registerComponent(MouseLookComponent);
engine.registerComponent(PlayerHeight);
engine.registerComponent(ActiveCamera);
engine.registerComponent(ControlsVR);
engine.registerComponent(DefaultInputBridge);
engine.registerComponent(GrabPoint);
engine.registerComponent(Grabbable);
engine.registerComponent(Interactor);
engine.registerComponent(PlayerController);
engine.registerComponent(PlayerRotate);
/* wle:auto-register:end */
}
