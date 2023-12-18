import {Component, NumberArray, Object3D} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';
import {typename} from '../../constants.js';
import {ControlsKeyboard} from './controls-keyboard.js';
import {vec3} from 'gl-matrix';
import {ControlsVR} from './controls-vr.js';
import {Handedness} from '../interactor.js';
import {absMaxVec3} from '../../utils/math.js';

export const InputBridgeTypename = typename('input-bridge');

/**
 * Defines an interface for bridging various input methods into a unified control scheme.
 *
 * The `InputBridge` serves as an abstraction layer that enables an application to
 * process input data from different sources such as keyboards, game controllers,
 * and VR controllers in a consistent manner. Implementations of this interface should
 * provide mechanisms to interpret and translate these diverse inputs into a set
 * of standardized movement and rotation vectors that the application can easily use
 * for navigation and interaction within a 3D environment.
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
 * A default implementation of `InputBridge` that handles input from
 * default providers like keyboards, mice, touch devices, VR controllers,
 * and game controllers.
 *
 * `DefaultInputBridge` integrates with the underlying input systems provided by
 * Wonderland Engine, gathering input data and converting it into a consistent format.
 * This class allows you to query for movement and rotation data, as well as the
 * position and forward direction of VR controllers, offering a seamless input experience
 * regardless of the hardware used.
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
            this._vrController.getObject(handedness).getPositionWorld(position);
            return true;
        }
        return false;
    }

    /** @override */
    getControllerForward(forward: NumberArray, handedness: Handedness): boolean {
        if (this._vrController && this._vrController.active) {
            this._vrController.getObject(handedness).getForwardWorld(forward);
            return true;
        }
        return false;
    }
}
