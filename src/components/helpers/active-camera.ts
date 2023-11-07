import {Component, Object3D} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';
import {typename} from '../../constants.js';

/**
 * Helper component to get the active camera.
 *
 * This component adds a bit of reusable code for getting the object for the active camera.
 */
export class ActiveCamera extends Component {
    static TypeName = typename('active-camera');

    @property.object({required: true})
    nonVrCamera!: Object3D;

    @property.object({required: true})
    leftEye!: Object3D;

    /**
     * Based on the current XR session (is VR active or not), returns the active camera.
     * @returns The active camera.
     */
    getActiveCamera(): Object3D {
        return this.engine.xr?.session ? this.leftEye : this.nonVrCamera;
    }
}
