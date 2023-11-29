import {Component, Property} from '@wonderlandengine/api';
import { ButtonComponent } from './button';

/** Recursively get all objects in a hierarchy */
function getHierarchy(object, out = []) {
    out.push(object);
    const children = object.children;
    for (const child of children) {
        getHierarchy(child, out);
    }
    return out;
}

/**
 * game-mananger
 */
export class GameMananger extends Component {
    static TypeName = 'game-manager';
    /* Properties that are configurable in the editor */
    static Properties = {
        button: Property.object(),
    };

    _objects = [];
    _positions = [];

    reset = () => {
        for (let i = 0; i < this._objects.length; ++i) {
            const object = this._objects[i];
            const physx = object.getComponent('physx');
            if (physx) {
                physx.active = false;
            }
            object.resetRotation();
            object.setPositionWorld(this._positions[i]);
            if (physx) {
                physx.active = true;
            }
        }
    };

    onActivate() {
        const button = this.button.getComponent(ButtonComponent);
        button.onPressed.add(this.reset);
    }

    onDeactivate() {
        const button = this.button.getComponent(ButtonComponent);
        button.onPressed.remove(this.reset);
    }

    start() {
        this._objects = getHierarchy(this.object);
        for (const object of this._objects) {
            this._positions.push(object.getPositionWorld());
        }
    }
}
