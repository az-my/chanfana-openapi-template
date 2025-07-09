import { OpenAPIRoute } from "chanfana";

export class HealthCheck extends OpenAPIRoute {
  async handle() {
    return {
      status: "ok"
    };
  }
}
