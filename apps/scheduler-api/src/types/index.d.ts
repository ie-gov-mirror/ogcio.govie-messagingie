/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */

import type {
  FastifyLoggerInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerBase,
  RawServerDefault,
} from "fastify";

declare module "fastify" {
  export interface FastifyInstance<
    RawServer extends RawServerBase = RawServerDefault,
    RawRequest extends
      RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
    RawReply extends
      RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>,
    Logger = FastifyLoggerInstance,
  > {
    config: {
      POSTGRES_USER: string;
      POSTGRES_PASSWORD: string;
      POSTGRES_HOST: string;
      POSTGRES_PORT: number;
      POSTGRES_DB_NAME: string;
      LOGTO_OIDC_ENDPOINT: string;
      LOGTO_JWK_ENDPOINT: string;
      LOGTO_API_RESOURCE_INDICATOR: string;
      LOG_LEVEL: string;
      POSTGRES_SSL: boolean;
    };
  }
}
