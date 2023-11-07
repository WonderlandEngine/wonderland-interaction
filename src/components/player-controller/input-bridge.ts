import {Component, Object3D} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';
import {typename} from '../../constants.js';
import {ControlsKeyboard} from './controls-keyboard.js';
import {vec3} from 'gl-matrix';

/**
 * A proxy for handling input from various input providers, such as keyboard, mouse, touch,
 * VR controllers or game controllers.
 */

export class InputBridge extends Component {
    static TypeName = typename('input-bridge');

    private static movementAxis = vec3.create();

    @property.object({required: true})
    inputs!: Object3D;

    private keyboardController?: ControlsKeyboard | null;

    start(): void {
        this.keyboardController = this.inputs.getComponent(ControlsKeyboard);
    }

    getMovementAxis(): vec3 {
        vec3.zero(InputBridge.movementAxis);

        if (this.keyboardController && this.keyboardController.active) {
            vec3.copy(InputBridge.movementAxis, this.keyboardController.getAxis());
        }

        return InputBridge.movementAxis;
    }
}
