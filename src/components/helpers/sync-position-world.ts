import {Component, Object3D} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';
import {vec3} from 'gl-matrix';

const tempVec3 = vec3.create();

/**
 * The Fixed joint groups together objects,
 * making them stick together.
 */
export class SyncPositionWorld extends Component {
    static TypeName = 'sync-position-world';

    @property.object({required: true})
    target!: Object3D;

    update() {
        this.target.getPositionWorld(tempVec3);
        this.object.setPositionWorld(tempVec3);
    }
}
