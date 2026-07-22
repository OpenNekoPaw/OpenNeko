/**
 * Base module exports
 */

export {
  ServiceCollection,
  createServiceId,
  setGlobalServices,
  getService,
} from './serviceCollection';

export { setRootLogger, getRootLogger, getLogger } from './logger';

export { setErrorHandler, handleError } from './errorHandler';
