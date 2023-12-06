import {Component, NumberArray, Object3D} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';
import {typename} from '../../constants.js';
import {ControlsKeyboard} from './controls-keyboard.js';
import {vec3} from 'gl-matrix';
import {ControlsVR} from './controls-vr.js';
import {Handedness} from '../interactor.js';
import { absMaxVec3 } from '../../utils/math.js';

export const InputBridgeTypename = typename('input-bridge');

/**
 * A proxy for handling input.
 */
export interface InputBridge extends Component {
    /**
     * Get the rotation axis.
     *
     * @param out The destination array.
     * @returns The `out` parameter;
     */
    getRotationAxis<T extends NumberArray>(out: T): T;
    /**
     * Get the movement axis.
     *
     * @param out The destination array.
     * @returns The `out` parameter;
     */
    getMovementAxis<T extends NumberArray>(out: T): T;

    /**
     * Get the position of the VR controller
     *
     * @param out The destination array.
     * @param handedness the handedness of the controller.
     * @returns true if the controller is active, false otherwise.
     */
    getControllerPosition(out: NumberArray, handedness: Handedness): boolean;

    /**
     * Get the forward direction of the VR controller.
     *
     * @param out The destination array.
     * @param handedness the handedness of the controller.
     * @returns true if the controller is active, false otherwise.
     */
    getControllerForward(out: NumberArray, handedness: Handedness): boolean;
}

/**
 * Default bridge handling providers, such as keyboard, mouse, touch,
 * VR controllers or game controllers.
 */
export class DefaultInputBridge extends Component implements InputBridge {
    static TypeName = InputBridgeTypename;

    @property.object({required: true})
    inputs!: Object3D;

    private _keyboardController: ControlsKeyboard | null = null;
    private _vrController: ControlsVR | null = null;

    start(): void {
        this._keyboardController = this.inputs.getComponent(ControlsKeyboard);
        this._vrController = this.inputs.getComponent(ControlsVR);
    }

    /** @override */
    getRotationAxis<T extends NumberArray>(out: T): T {
        const dest = out as unknown as vec3;
        vec3.zero(dest);
        if (this._vrController?.active) {
            vec3.copy(dest, this._vrController.getAxisRotation());
        }
        return out;
    }

    /** @override */
    getMovementAxis<T extends NumberArray>(out: T): T {
        const dest = out as unknown as vec3;
        vec3.zero(dest);

        // determine the movement axis with the highest values
        if (this._keyboardController && this._keyboardController.active) {
            vec3.copy(dest, this._keyboardController.getAxis());
        }

        if (this._vrController && this._vrController.active) {
            absMaxVec3(dest, dest, this._vrController.getAxisMove());
        }

        return out;
    }

    /** @override */
    getControllerPosition(position: NumberArray, handedness: Handedness): boolean {
        if (this._vrController && this._vrController.active) {
            this._vrController
                .getObject(handedness)
                .getPositionWorld(position);
            return true;
        }
        return false;
    }

    /** @override */
    getControllerForward(forward: NumberArray, handedness: Handedness): boolean {
        if (this._vrController && this._vrController.active) {
            this._vrController
                .getObject(handedness)
                .getForwardWorld(forward);
            return true;
        }
        return false;
    }
}
