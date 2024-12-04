class Vue {
  constructor(options) {
    // 保存创建时候传递过来的数据
    if (this.isElement(options.el)) {
      this.$el = options.el;
    } else {
      this.$el = document.querySelector(options.el);
    }
    this.$data = options.data;
    this.proxyData();
    this.$methods = options.methods;
    this.$computed = options.computed;
    /**
     * 将computed中的方法添加到$data中, 只有这样将来我们在渲染的时候才能够从$data中获取到computed中定义的计算属性
     */
    this.computed2Data();
    // 编译
    if (this.$el) {
      // 给所有的数据添加get/set方法
      new Observer(this.$data);
      new Compire(this);
    }
  }
  // 判断是否是一个元素
  isElement(node) {
    return node.nodeType === 1;
  }
  // 数据代理
  proxyData() {
    for (const key in this.$data) {
      Object.defineProperty(this, key, {
        get: () => {
          return this.$data[key];
        },
        set: (newVal) => {
          this.$data[key] = newVal;
        }
      })
    }
  }
  computed2Data() {
    for (const key in this.$computed) {
      Object.defineProperty(this.$data, key, {
        get: () => {
          return this.$computed[key].call(this);
        },
        set(newVal) {
          this.$computed[key].call(this, newVal);
        }
      })
    }
  }
}

class Compire {
  constructor(vm) {
    this.vm = vm;
    /**
 * 1.将网页上的元素放到内存中
 * 2.利用指定的数据编译内存中的元素
 * 3.将编译好的内容重新绘制回网页
 */
    // 将元素存入内存
    let fragment = this.node2fragment(this.vm.$el);
    // 编译
    this.buildTemplate(fragment);
    // 渲染饭
    this.vm.$el.appendChild(fragment);
  }
  // 编译
  node2fragment(app) {
    // 创建空的文档碎片对象
    let fragment = document.createDocumentFragment();
    // 编译循环取到的每一个元素
    let node = app.firstChild;
    while (node) {
      fragment.appendChild(node);
      node = app.firstChild;
    }
    // 返回存储了所有元素的文档碎片对象
    return fragment;
  }
  buildTemplate(fragment) {
    let nodeList = [...fragment.childNodes];
    nodeList.forEach(node => {
      // 判断当前遍历到的节点是元素还是文本
      // 如果是一个元素，需要判断有没有v-model属性
      // 如果是一个文本, 需要判断有没有{{}}
      if (this.vm.isElement(node)) {
        // 是一个元素
        this.buildElement(node);
        // 处理子元素
        this.buildTemplate(node); // 递归一下
      } else {
        // 不是
        this.buildText(node);
      }
    })
  }
  buildElement(node) {
    let attrs = [...node.attributes];
    attrs.forEach(attr => {
      const { name, value } = attr;
      /**
       * v-model="name"
       * v-on:click="fn"
       * name v-on:click
       * value myFn 函数名
       */
      if (name.startsWith('v-')) {
        // 指令 v-model="name"
        let [dirName, dirType] = name.split(':');['v-on', 'click'];
        let [, dir] = dirName.split('-');
        CompireUtil[dir](node, value, this.vm, dirType);
      }
    })
  }
  buildText(node) {
    let content = node.textContent;
    let reg = /\{\{.+?|\|\}/gi;
    if (reg.test(content)) {
      CompireUtil["content"](node, content, this.vm);
    }
  }
}

const CompireUtil = {
  // 获取递归value
  getValue(vm, value) {
    return value.split('.').reduce((data, currentKey) => {
      // 1. data = $data, currentKey = time
      // 2. data = $data.time
      return data[currentKey.trim()];
    }, vm.$data);
  },
  // 获取content
  getContent(vm, value) {
    const reg = /\{\{(.+?)\}\}/ig;
    const val = value.replace(reg, (...args) => {
      return this.getValue(vm, args[1]);
    })
    return val;
  },
  setValue(vm, attr, newValue) {
    attr.split('.').reduce((data, currentAttr, index, arr) => {
      if (index === arr.length - 1) {
        data[currentAttr] = newValue;
      }
      return data[currentAttr];
    }, vm.$data);
  },

  model: function (node, value, vm) {
    // 第一次渲染时给所有属性添加观察者
    new Watcher(vm, value, (newVal, oldVal) => {
      node.value = newVal;
    });
    const newVal = this.getValue(vm, value);
    node.value = newVal;
    node.addEventListener('input', (e) => {
      const newVal = e.target.value;
      // 触发属性的set方法，将新值赋值给属性
      this.setValue(vm, value, newVal);
    })
  }
  ,
  html: function (node, value, vm) {
    new Watcher(vm, value, (newVal, oldVal) => {
      node.innerHTML = newVal;
    })
    const val = this.getValue(vm, value);
    node.innerHTML = val; 
  }
  ,
  text: function (node, value, vm) {
    new Watcher(vm, value, (newVal, oldVal) => {
      node.innerText = newVal;
    });
    const val = this.getValue(vm, value);
    node.innerText = val;
  },
  content: function (node, value, vm) {
    const reg = /\{\{(.+?)\}\}/gi;
    const val = value.replace(reg, (...args) => {
      new Watcher(vm, args[1], (newVal, oldVal) => {
        node.textContent = newVal;
      })
      return this.getValue(vm, args[1]);
    });
    node.textContent = val;
  },
  on: function (node, value, vm, type) {
    node.addEventListener(type, (e) => {
      vm.$methods[value].call(vm, e);
    })
  }
}

class Observer {
  constructor(data) {
    this.observer(data);
  }
  observer(obj) {
    if (obj && typeof obj === 'object') {
      for (const key in obj) {
        this.defineReactive(obj, key, obj[key]);
      }
    }
  }
  defineReactive(obj, key, value) {
    // 递归
    this.observer(value);
    // 将当前属性的所有观察者对象放到当前属性的发布订阅对象中管理起来
    const dep = new Dep(); // 当前属性的发布订阅对象
    Object.defineProperty(obj, key, {
      get() {
        Dep.target && dep.addSub(Dep.target);
        return value;
      },
      set(newValue) {
        if (value !== newValue) {
          value = newValue;
          dep.notify();
          console.log('属性' + key + '已经被监听了，现在值为：' + newValue);
        }
      }
    })
  }
}

class Watcher {
  constructor(vm, attr, cb) {
    this.vm = vm;
    this.attr = attr;
    this.cb = cb;
    // 创建观察者对象时获取旧值
    this.oldValue = this.getOldValue();
  }
  getOldValue() {
    // 当前创建的观察者保存到全局
    Dep.target = this;
    // return CompireUtil.getValue(this.vm, this.attr);
    const oldValue = CompireUtil.getValue(this.vm, this.attr);
    // 释放当前观察者
    Dep.target = null;
    return oldValue;
  }
  // 定义一个更新的方法，用于判断新值和旧值是否相同
  update() {
    const newValue = CompireUtil.getValue(this.vm, this.attr);
    if (newValue !== this.oldValue) {
      // 执行回调
      this.cb(newValue, this.oldValue);
    }
  }
}

class Dep {
  constructor() {
    // 管理某个属性所有的观察者对象
    this.subs = [];
  }
  // 订阅
  addSub(sub) {
    this.subs.push(sub);
  }
  // 发布订阅
  notify() {
    this.subs.forEach(watcher => {
      watcher.update();
    })
  }
}