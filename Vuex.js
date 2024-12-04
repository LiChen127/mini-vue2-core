/**
 * vue.use时执行
 */
const install = () => {
  // 给每一个实例都添加一个$store属性
  /**
   * 在Vue中有一个名称叫做mixin方法，这个方法会在创建每一个Vue实例的时候执行
   */
  Vue.mixin();
}

class Store {
  constructor(options) {

  }
}

export default {
  Store,
  install,
}