/**
 * Message Handler Registry
 *
 * Manages registration and dispatch of message handlers.
 */

import type { ExtensionToWebviewMessage } from './messages';
import type {
  HandlerRegistration,
  MessageHandler,
  MessageHandlerContext,
  ProtocolMessageDispatcher,
  WebviewMessageType,
} from './types';
import { defineHandler } from './types';

/**
 * Message handler registry
 *
 * Dispatches typed ExtensionToWebviewMessage to registered handlers.
 */
export class MessageHandlerRegistry {
  private handlers: Map<WebviewMessageType, ProtocolMessageDispatcher> = new Map();

  /**
   * Register a handler for a message type
   */
  register<T extends WebviewMessageType>(type: T, handler: MessageHandler<T>): void {
    const registration = defineHandler(type, handler);
    this.handlers.set(registration.type, registration.handler);
  }

  /**
   * Register multiple handlers at once
   */
  registerAll(registrations: HandlerRegistration[]): void {
    for (const { type, handler } of registrations) {
      this.handlers.set(type, handler);
    }
  }

  /**
   * Handle a typed message from the Extension Host.
   * @returns true if handled, false if no handler found
   */
  handle(message: ExtensionToWebviewMessage, context: MessageHandlerContext): boolean {
    const handler = this.handlers.get(message.type);
    if (handler) {
      handler(message, context);
      return true;
    }
    return false;
  }

  /**
   * Check if a handler exists for a message type
   */
  has(type: WebviewMessageType): boolean {
    return this.handlers.has(type);
  }

  /**
   * Get all registered message types
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
}
