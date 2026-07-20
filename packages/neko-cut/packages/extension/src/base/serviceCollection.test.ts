/**
 * ServiceCollection 单元测试
 *
 * 测试 DI 容器的核心功能
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ServiceCollection,
  createServiceId,
  setGlobalServices,
  getService,
  getGlobalServices,
} from './serviceCollection';

// =============================================================================
// Mock 服务
// =============================================================================

interface ITestService {
  getValue(): string;
}

interface IDisposableService {
  getValue(): string;
  dispose(): void;
}

class TestService implements ITestService {
  constructor(private value: string = 'test') {}

  getValue(): string {
    return this.value;
  }
}

class DisposableService implements IDisposableService {
  private disposed = false;

  getValue(): string {
    if (this.disposed) {
      throw new Error('Service disposed');
    }
    return 'disposable';
  }

  dispose(): void {
    this.disposed = true;
  }

  isDisposed(): boolean {
    return this.disposed;
  }
}

// =============================================================================
// 测试套件
// =============================================================================

describe('ServiceCollection', () => {
  let services: ServiceCollection;

  beforeEach(() => {
    services = new ServiceCollection();
  });

  // ---------------------------------------------------------------------------
  // 服务标识符
  // ---------------------------------------------------------------------------

  describe('createServiceId', () => {
    it('应该创建唯一的服务标识符', () => {
      const id1 = createServiceId<ITestService>('testService');
      const id2 = createServiceId<ITestService>('testService2');

      expect(id1.toString()).toBe('testService');
      expect(id2.toString()).toBe('testService2');
      expect(id1).not.toBe(id2);
    });

    it('相同 ID 字符串应该创建不同的标识符实例', () => {
      const id1 = createServiceId<ITestService>('testService');
      const id2 = createServiceId<ITestService>('testService');

      // 虽然 toString 相同，但实例不同
      expect(id1.toString()).toBe(id2.toString());
      expect(id1).not.toBe(id2);
    });
  });

  // ---------------------------------------------------------------------------
  // 服务注册和获取
  // ---------------------------------------------------------------------------

  describe('服务注册和获取', () => {
    it('应该能够注册和获取服务', () => {
      const ITestService = createServiceId<ITestService>('testService');
      const service = new TestService('hello');

      services.set(ITestService, service);
      const retrieved = services.get(ITestService);

      expect(retrieved).toBe(service);
      expect(retrieved?.getValue()).toBe('hello');
    });

    it('获取未注册的服务应该返回 undefined', () => {
      const ITestService = createServiceId<ITestService>('testService');

      const retrieved = services.get(ITestService);

      expect(retrieved).toBeUndefined();
    });

    it('应该能够覆盖已注册的服务', () => {
      const ITestService = createServiceId<ITestService>('testService');
      const service1 = new TestService('first');
      const service2 = new TestService('second');

      services.set(ITestService, service1);
      services.set(ITestService, service2);

      const retrieved = services.get(ITestService);

      expect(retrieved).toBe(service2);
      expect(retrieved?.getValue()).toBe('second');
    });

    it('应该能够检查服务是否已注册', () => {
      const ITestService = createServiceId<ITestService>('testService');
      const INotRegistered = createServiceId<ITestService>('notRegistered');
      const service = new TestService();

      services.set(ITestService, service);

      expect(services.has(ITestService)).toBe(true);
      expect(services.has(INotRegistered)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 可释放服务
  // ---------------------------------------------------------------------------

  describe('可释放服务', () => {
    it('dispose 应该释放所有可释放的服务', () => {
      const IDisposableService = createServiceId<IDisposableService>('disposableService');
      const service = new DisposableService();

      services.set(IDisposableService, service);
      services.dispose();

      expect((service as DisposableService).isDisposed()).toBe(true);
    });

    it('dispose 应该清空服务集合', () => {
      const ITestService = createServiceId<ITestService>('testService');
      const service = new TestService();

      services.set(ITestService, service);
      services.dispose();

      expect(services.has(ITestService)).toBe(false);
      expect(services.get(ITestService)).toBeUndefined();
    });

    it('dispose 应该能处理释放过程中的错误', () => {
      const IDisposableService = createServiceId<IDisposableService>('disposableService');
      const service = {
        getValue: () => 'test',
        dispose: () => {
          throw new Error('Dispose error');
        },
      };

      services.set(IDisposableService, service);

      // 不应该抛出错误
      expect(() => services.dispose()).not.toThrow();
    });

    it('多次 dispose 应该安全', () => {
      const IDisposableService = createServiceId<IDisposableService>('disposableService');
      const service = new DisposableService();

      services.set(IDisposableService, service);

      services.dispose();
      expect(() => services.dispose()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // 多服务场景
  // ---------------------------------------------------------------------------

  describe('多服务场景', () => {
    it('应该能够注册多个不同类型的服务', () => {
      const IService1 = createServiceId<ITestService>('service1');
      const IService2 = createServiceId<ITestService>('service2');
      const IService3 = createServiceId<IDisposableService>('service3');

      const service1 = new TestService('one');
      const service2 = new TestService('two');
      const service3 = new DisposableService();

      services.set(IService1, service1);
      services.set(IService2, service2);
      services.set(IService3, service3);

      expect(services.get(IService1)?.getValue()).toBe('one');
      expect(services.get(IService2)?.getValue()).toBe('two');
      expect(services.get(IService3)?.getValue()).toBe('disposable');
    });

    it('dispose 应该释放所有可释放的服务', () => {
      const IService1 = createServiceId<IDisposableService>('service1');
      const IService2 = createServiceId<IDisposableService>('service2');

      const service1 = new DisposableService();
      const service2 = new DisposableService();

      services.set(IService1, service1);
      services.set(IService2, service2);

      services.dispose();

      expect((service1 as DisposableService).isDisposed()).toBe(true);
      expect((service2 as DisposableService).isDisposed()).toBe(true);
    });
  });
});

// =============================================================================
// 全局服务测试
// =============================================================================

describe('全局服务访问', () => {
  beforeEach(() => {
    // 清理全局状态
    setGlobalServices(undefined as any);
  });

  it('应该能够设置和获取全局服务', () => {
    const services = new ServiceCollection();
    const ITestService = createServiceId<ITestService>('testService');
    const service = new TestService('global');

    services.set(ITestService, service);
    setGlobalServices(services);

    const retrieved = getService(ITestService);

    expect(retrieved).toBe(service);
    expect(retrieved?.getValue()).toBe('global');
  });

  it('未设置全局服务时 getService 应该返回 undefined', () => {
    const ITestService = createServiceId<ITestService>('testService');

    const retrieved = getService(ITestService);

    expect(retrieved).toBeUndefined();
  });

  it('应该能够获取全局服务集合', () => {
    const services = new ServiceCollection();

    setGlobalServices(services);
    const retrieved = getGlobalServices();

    expect(retrieved).toBe(services);
  });

  it('未设置全局服务时 getGlobalServices 应该返回 undefined', () => {
    const retrieved = getGlobalServices();

    expect(retrieved).toBeUndefined();
  });
});

// =============================================================================
// 类型安全测试
// =============================================================================

describe('类型安全', () => {
  it('服务标识符应该保持类型信息', () => {
    const services = new ServiceCollection();
    const ITestService = createServiceId<ITestService>('testService');
    const service = new TestService('typed');

    services.set(ITestService, service);
    const retrieved = services.get(ITestService);

    // TypeScript 编译时检查 - 这里主要确保运行时行为正确
    expect(retrieved?.getValue()).toBe('typed');
  });
});
