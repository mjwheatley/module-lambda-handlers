import { Logger } from '@mawhea/module-winston-logger';
import { singleton as appConfig } from '@mawhea/module-config-singleton';

const {
  LOG_LEVEL = `silly`
} = process.env;

const defaultResponse = {
  statusCode: 200,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Content-Type': 'application/json'
  }
};

/**
 * Handler Class
 * **/
export class Handler {
  public event: any;
  public payload: any;
  // @ts-ignore
  public context: any;
  public lambdaResponse: any;
  public lambdaResponseBody: string;
  public alias: string;
  public loggerMetaData: any;
  public logger: Logger;

  /**
   * @param {Object} event
   * @param {Object} context
   * **/
  constructor({ event, context }: { event: any, context: any }) {
    this.event = event;
    this.payload = {};
    this.context = context;
    this.lambdaResponse = JSON.parse(JSON.stringify(defaultResponse));
    this.lambdaResponseBody = ``;
    const invokeLambdaParts = context.invokedFunctionArn.split(`:`);
    this.alias = invokeLambdaParts[invokeLambdaParts.length - 1] !== context.functionVersion ?
      invokeLambdaParts[invokeLambdaParts.length - 1] : `NONE`;
    this.loggerMetaData = {
      LambdaName: context.functionName,
      LambdaAlias: this.alias,
      LambdaVersion: context.functionVersion,
      InvokeId: context.awsRequestId
    };
    this.logger = new Logger({
      metaData: this.loggerMetaData,
      config: { logger: { LOG_LEVEL } }
    });
    this.logger.silly(`Trace`, `Handler.constructor()`);
    this.logger.info(`EVENT`, event);
  }

  /**
   * @return {Object} App Config
   */
  static get config() {
    return appConfig.get();
  }

  /**
   * @param {Object} sessionData
   * @param {Object} logger
   * @return {Object} App Config
   */
  static getConfigWithOverrides(sessionData: any, logger: any) {
    return appConfig.get(sessionData, logger);
  }

  /**
   * Update the app config singleton
   * @param {Object} config
   * **/
  updateAppConfig({ config }: { config: any }) {
    appConfig.update({ config });
  };

  /**
   * @return {Boolean} isValidEvent
   */
  validateEvent() {
    return true;
  }

  /**
   * Sets Lambda response.
   * @param {Object} lambdaResponse
   */
  setLambdaResponse(lambdaResponse: any) {
    if (!lambdaResponse ||
      (lambdaResponse && typeof lambdaResponse !== `object`) ||
      (lambdaResponse && typeof lambdaResponse === `object` && Array.isArray(lambdaResponse))
    ) {
      lambdaResponse = null;
    }
    this.lambdaResponse = lambdaResponse || JSON.parse(JSON.stringify(defaultResponse));
  }

  /**
   * @param {Object} params
   * @param {Object} params.controller
   * @return {Promise<Object>} response - application/json response body
   */
  async startController({ controller }: { controller: any }) {
    this.logger.silly(`Trace`, `Handler.startController()`);
    if (this.lambdaResponseBody) return;
    return controller.execute({
      payload: this.payload,
      logger: this.logger
    });
  }

  /**
   * Sends response
   * @param {Object} data
   * @return {Object} lambdaResponse
   */
  sendResponse(data?: any) {
    if (data) {
      this.lambdaResponseBody = data;
    }
    this.lambdaResponse.body = JSON.stringify(this.lambdaResponseBody);
    this.logger.info(`Lambda Response`, this.lambdaResponse);
    return this.lambdaResponse;
  }

  /**
   * Status code is checked in the QueueReader lambda for each Handler
   * and if any are not 200 it returns the error code so Failed messages
   * put back on queue.
   * @param {Object} params
   * @return {Object} lambdaResponse
   */
  handleError({ error }: { error: any }) {
    this.logger.error(`Lambda Error`, error);
    this.lambdaResponse.headers[`Content-Type`] = `application/json`;
    this.lambdaResponse.statusCode = 500;
    if (error instanceof Error) {
      error = {
        message: error.message,
        stack: error.stack
      };
    }
    this.lambdaResponse.body = JSON.stringify({ error });
    return this.lambdaResponse;
  }

  /**
   * Sets this.payload that will be passed to this.startController()
   * **/
  setPayloadFromEvent() {
    this.payload = this.event;
  }

  /**
   *
   * @param {Object} controller
   * @return {Promise}
   */
  async handleIt({ controller }: { controller: any }) {
    if (!this.validateEvent()) {
      this.lambdaResponse.headers[`Content-Type`] = `application/json`;
      this.lambdaResponse.statusCode = 422;
      this.lambdaResponse.body = JSON.stringify({
        message: `Invalid event schema. Unable to process event.`
      });
      return this.lambdaResponse;
    }

    try {
      this.setPayloadFromEvent();
      const data = await this.startController({ controller });
      return this.sendResponse(data);
    } catch (error) {
      return this.handleError({ error });
    }
  }
}
