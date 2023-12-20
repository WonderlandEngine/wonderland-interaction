import {Object3D} from '@wonderlandengine/api';

/**
 * Recursively sets the active state of the given object and all its children.
 * @param object The object to set the active state of.
 * @param active The state to set.
 *
 * @example
 * ```js
 * // turn off all components on this object and its children
 * setComponentsActive(this.someObject, false);
 * ```
 */
export function setComponentsActive(object: Object3D, active: boolean) {
    object.active = active;

    object.getComponents().forEach((c) => (c.active = active));

    object.children.forEach((c) => setComponentsActive(c, active));
}
