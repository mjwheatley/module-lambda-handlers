import { AWSServices } from '@mawhea/module-aws-services';
import { Handler } from './Handler';

const { SQS_BASE_URL } = process.env;

/**
 * QueueHandler Class
 * **/
export class QueueHandler extends Handler {
  public record: any;
  public queueName: string;
  public requestedDelay: any;

  /**
   * Constructor
   * Record param is single record from SQS Message Event Records Array
   * see: https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html
   * @param {Object} params
   * @param {Object} params.record
   * @param {String} params.queueName
   **/
  constructor({ record, context, queueName }: { record: any, context: any, queueName: string }) {
    super({ event: record, context });
    this.record = record;
    this.queueName = queueName;
    const { messageId } = record;
    this.logger.addMetaDataByObject({ messageId });
    this.logger.debug(`Trace()`, `QueueHandler.constructor() after super()`);
    let payload;
    try {
      payload = JSON.parse(record.body);
    } catch (error) {
      payload = {};
    }
    this.payload = payload;
    /**
     * If the message source was from SNS check for the Message property for the payload
     * **/
    if (payload.Message) {
      try {
        payload = JSON.parse(payload.Message);
      } catch (error) {
        payload = {};
      }
    }
    this.payload = payload;
    this.requestedDelay = (this.record.messageAttributes.requestedDelay ?
        Number(this.record.messageAttributes.requestedDelay.stringValue) : 0) ||
      this.payload.requestedDelay || 0;
  }

  /**
   * @override confirm inspect record
   * @return {boolean} isValidEvent
   */
  validateEvent() {
    this.logger.debug(`Trace`, `QueueHandler.validateEvent()`);
    return !!(this.record && this.record.attributes && this.requestedDelay);
  }

  /**
   * For Queue Reader need to check timeDelayed to requestedDelay
   *  @return {Promise}
   */
  checkExecutionStartThreshold() {
    this.logger.debug(`Trace`, `QueueHandler.checkExecutionStartThreshold()`);
    const timeDelayed = Date.now() - Number(this.record.attributes.SentTimestamp);
    const requestedDelay = Number(this.requestedDelay) * 1000;
    this.logger.info(`Check Delay`, `timeDelayed - ${timeDelayed}; requestedDelay - ${requestedDelay}`);
    if (timeDelayed < requestedDelay) {
      let newRequestedDelay = requestedDelay - timeDelayed;
      newRequestedDelay = Math.ceil(Number(newRequestedDelay / 1000));
      const message = `${newRequestedDelay} seconds remaining before processing`;

      this.lambdaResponse.headers[`Content-Type`] = `application/json`;
      this.lambdaResponse.statusCode = 200;
      this.logger.info(`Requested Delay Not Met`, message);
      this.lambdaResponseBody = JSON.stringify({ message });

      return AWSServices.createQueueAction({
        payload: this.payload,
        requestedDelay: newRequestedDelay,
        queueUrl: this.getQueueUrl(),
        logger: this.logger
      });
    }
  }

  /**
   * @override call super start flow and if success delete message
   * @param {Object} params
   * @param {Object} params.controller
   * @return {Object} response - application/json response body
   */
  async startController({ controller }: { controller: any }) {
    this.logger.debug(`Trace`, `QueueHandler.startController()`);
    try {
      const response = await super.startController({ controller });
      const params = {
        QueueUrl: this.getQueueUrl(),
        ReceiptHandle: this.record.receiptHandle
      };
      await AWSServices.sqsDeleteMessage({ params });
      return response;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Sends response
   * @param {Object} data
   * @return {Object} lambdaResponse
   */
  sendResponse(data: any) {
    if (data) {
      this.lambdaResponseBody = data;
    }
    this.lambdaResponse.body = JSON.stringify(this.lambdaResponseBody);
    this.logger.info(`Lambda Response`, this.lambdaResponse);
    return this.lambdaResponse;
  }

  /**
   * Get Queue URL for SQS Queue for Stage
   * @return {string}
   */
  getQueueUrl() {
    return `${SQS_BASE_URL}${this.queueName}`;
  }

  /**
   * @override add this.checkExecutionStartThreshold() before this.startController()
   * @param {Object} controller
   * @return {Promise}
   */
  async handleIt({ controller }: { controller: any }) {
    this.logger.debug(`Trace`, `QueueHandler.handleIt()`);
    if (!this.validateEvent()) {
      this.lambdaResponse.headers[`Content-Type`] = `application/json`;
      this.lambdaResponse.statusCode = 422;
      this.lambdaResponse.body = JSON.stringify({
        message: `Invalid event schema. Unable to process event.`
      });
      this.logger.error(`QueueHandler.handleIt()`, `Event Validation Failed`);
      return this.lambdaResponse;
    }
    try {
      await this.checkExecutionStartThreshold();
      const data = await this.startController({ controller });
      return this.sendResponse(data);
    } catch (error) {
      return this.handleError({ error });
    }
  }
}
