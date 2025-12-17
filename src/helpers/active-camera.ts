import {Component, NumberArray, Object3D} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';
import {quat, quat2, vec3} from 'gl-matrix';
import {TempQuat} from '../internal-constants.js';

const tempVec1 = vec3.create();
const tempVec2 = vec3.create();

/**
 * This component helps retrieve the camera position in VR and non-VR.
 */
export class ActiveCamera extends Component {
    static TypeName = 'active-camera';

    @property.object({required: true})
    nonVrCamera!: Object3D;

    @property.object({required: true})
    leftEye!: Object3D;

    @property.object({required: true})
    rightEye!: Object3D;

    /**
     * Based on the current XR session (is VR active or not), returns the active camera.
     * @returns The active camera.
     */
    get current(): Object3D {
        return this.engine.xr ? this.leftEye : this.nonVrCamera;
    }

    getForwardWorld(out: vec3) {
        const object = this.engine.xr ? this.leftEye : this.nonVrCamera;
        return object.getForwardWorld(out);
    }

    /**
     * Depending on the current XR session (is VR active or not),
     * returns the position of the active camera. For VR this is the average
     * of the left and right eye.
     * @param position The position to write the result to.
     * @returns The world position of the active camera.
     */
    getPositionWorld(out: vec3 = vec3.create()): vec3 {
        if (!this.engine.xr) {
            return this.nonVrCamera.getPositionWorld(out);
        }
        const cameraPosition = tempVec1;
        const rightEyePosition = tempVec2;

        this.leftEye.getPositionWorld(cameraPosition);
        this.rightEye.getPositionWorld(rightEyePosition);

        vec3.add(cameraPosition, cameraPosition, rightEyePosition);
        return vec3.scale(out, cameraPosition, 0.5);
    }
}
