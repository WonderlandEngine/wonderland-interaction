import {Component, InputComponent, Object3D} from '@wonderlandengine/api';
import {typename} from '../../constants.js';
import {property} from '@wonderlandengine/api/decorators.js';
import {vec3} from 'gl-matrix';
import {Handedness} from '../interactor.js';

const tempVectorAxisLeft = vec3.create();
const tempVectorAxisRight = vec3.create();

/**
 * Movement with VR controllers.
 *
 * @todo
 * - Add button presses
 * - Add selection for the type of movements, like:
 *   - walk and rotate with both controller
 *   - walk and strafe with left, rotate with right
 */
export class ControlsVR extends Component {
    static TypeName = typename('controls-vr');

    @property.object({required: true})
    leftControlObject!: Object3D;

    @property.object({required: true})
    rightControlObject!: Object3D;

    @property.float(0.1)
    deadzoneThreshold = 0.1;

    private _inputLeft!: InputComponent;
    private _inputRight!: InputComponent;
    private _axisLeft = vec3.create();
    private _axisRight = vec3.create();
    private _wasMoving = false;

    getAxisMove(): vec3 {
        return this._axisLeft;
    }

    getAxisRotation(): vec3 {
        return this._axisRight;
    }

    getObject(handedness: Handedness) {
        if (handedness === Handedness.Left) {
            return this.leftControlObject;
        } else {
            return this.rightControlObject;
        }
    }

    start() {
        const tempLeftInputComponent = this.leftControlObject.getComponent(InputComponent);
        if (!tempLeftInputComponent) {
            throw new Error(
                `controls-vr(${this.object.name}): leftControlObject does not have a InputComponent`
            );
        }
        this._inputLeft = tempLeftInputComponent;

        const tempRightInputComponent =
            this.rightControlObject.getComponent(InputComponent);
        if (!tempRightInputComponent) {
            throw new Error(
                `controls-vr(${this.object.name}): leftControlObject does not have a InputComponent`
            );
        }
        this._inputRight = tempRightInputComponent;
    }

    update() {
        // check if the controllers are connected
        if (
            !this._inputLeft.xrInputSource?.gamepad?.axes?.length ||
            !this._inputRight.xrInputSource?.gamepad?.axes?.length
        ) {
            if (this._wasMoving) {
                vec3.zero(this._axisLeft);
                vec3.zero(this._axisRight);
            }
            return;
        }

        // get the axes of the controllers
        tempVectorAxisLeft[0] = this._inputLeft.xrInputSource.gamepad.axes[2];
        tempVectorAxisLeft[2] = this._inputLeft.xrInputSource.gamepad.axes[3];
        if (
            Math.abs(tempVectorAxisLeft[0]) > this.deadzoneThreshold ||
            Math.abs(tempVectorAxisLeft[2]) > this.deadzoneThreshold
        ) {
            vec3.copy(this._axisLeft, tempVectorAxisLeft);
        } else {
            vec3.zero(this._axisLeft);
        }

        tempVectorAxisRight[0] = this._inputRight.xrInputSource.gamepad.axes[2];
        tempVectorAxisRight[2] = this._inputRight.xrInputSource.gamepad.axes[3];
        if (
            Math.abs(tempVectorAxisRight[0]) > this.deadzoneThreshold ||
            Math.abs(tempVectorAxisRight[2]) > this.deadzoneThreshold
        ) {
            vec3.copy(this._axisRight, tempVectorAxisRight);
        } else {
            vec3.zero(this._axisRight);
        }
    }
}
