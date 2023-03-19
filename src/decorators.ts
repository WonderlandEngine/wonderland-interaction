import {Component, ComponentConstructor, Type as TypeEnum, CustomParameter} from '@wonderlandengine/api';

/**
 * Component property.
 *
 * Usage:
 *
 * ```js
 * import {Component, Prop} from '@wonderlandengine/api';
 *
 * class MyComponent extends Component {
 *     static Properties = {
 *         myBool: Prop.bool(true),
 *         myInt: Prop.int(42),
 *         myString: Prop.string('Hello World!'),
 *         myMesh: Prop.mesh(),
 *     }
 * }
 * ```
 *
 * For TypeScript users, you can use the decorators instead.
 */
export const Type = {
  /**
   * Create an boolean property.
   *
   * @param defaultVal The default value. If not provided, defaults to `false`.
   */
  Bool(defaultVal: boolean = false) {
      return {type: TypeEnum.Bool, default: defaultVal};
  },

  /**
   * Create an integer property.
   *
   * @param defaultVal The default value. If not provided, defaults to `0`.
   */
  Int(defaultVal: number = 0) {
      return {type: TypeEnum.Int, default: defaultVal};
  },

  /**
   * Create an float property.
   *
   * @param defaultVal The default value. If not provided, defaults to `0.0`.
   */
  Float(defaultVal: number = 0.0) {
      return {type: TypeEnum.Float, default: defaultVal};
  },

  /**
   * Create an string property.
   *
   * @param defaultVal The default value. If not provided, defaults to `''`.
   */
  String(defaultVal = '') {
      return {type: TypeEnum.String, default: defaultVal};
  },

  /**
   * Create an enumeration property.
   *
   * @param values The list of values.
   * @param defaultVal The index of the default value. If not provided,
   *     defaults to the first element.
   */
  Enum(values: string[], defaultVal?: unknown) {
      values = values ?? [];
      defaultVal = defaultVal ?? values.at(0);
      return {type: TypeEnum.Enum, values, default: defaultVal};
  },

  /** Create an object reference property. */
  Object() {
      return {type: TypeEnum.Object, default: null};
  },

  /** Create an {@link Object} reference property. */
  Mesh() {
      return {type: TypeEnum.Mesh, default: null};
  },

  /** Create a {@link Texture} reference property. */
  Texture() {
      return {type: TypeEnum.Texture, default: null};
  },

  /** Create a {@link Material} reference property. */
  Material() {
      return {type: TypeEnum.Material, default: null};
  },

  /** Create an {@link Animation} reference property. */
  Animation() {
      return {type: TypeEnum.Animation, default: null};
  },

  /** Create a {@link Skin} reference property. */
  Skin() {
      return {type: TypeEnum.Skin, default: null};
  },

  /** Create a color property. */
  Color(defaultVal: number[] = [0.0, 0.0, 0.0, 1.0]) {
      return {type: TypeEnum.Color, default: defaultVal};
  },
};

/** Decorator for making a getter enumerable */
export function enumerable() {
    return function (_: any, __: string, descriptor: PropertyDescriptor) {
        descriptor.enumerable = true;
    };
}

/**
 * Decorator for JS component properties.
 */
export function type(data: CustomParameter) {
    return function (target: Component, propertyKey: string): void {
        const ctor = target.constructor as ComponentConstructor;
        ctor.Properties = ctor.Properties ?? {};
        ctor.Properties[propertyKey] = data;
    };
}
