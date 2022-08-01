import { Handler } from './Handler';

/**
 * Custom handler extension class for lambdas receiving SNS messages
 * **/
export class SNSHandler extends Handler {
  /**
   * Additional initialization
   * @param {Object} event
   * @param {Object} context
   * **/
  constructor({ event, context }: { event: any, context: any }) {
    super({ event, context });
    if (this.validateEvent()) {
      const messageId = this.event.Records[0].Sns.MessageId;
      this.logger.addMetaDataByObject({ messageId });
      this.logger.debug(`Trace()`, `SNSHandler.constructor() after super()`);
    }
  }

  /**
   * @override confirm inspect record
   * @return {boolean} isValidEvent
   */
  validateEvent() {
    this.logger.debug(`Trace`, `SNSHandler.validateEvent()`);
    return !!(this.event && this.event.Records && this.event.Records[0] && this.event.Records[0].Sns);
  }

  /**
   * Sets this.payload that will be passed to this.startController()
   * **/
  setPayloadFromEvent() {
    const message = this.event.Records[0].Sns.Message;
    this.payload = JSON.parse(message);
  }
}
