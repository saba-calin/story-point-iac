import {generateErrorResponse} from "../util";
import {
  CostExplorerClient,
  GetCostAndUsageCommand,
  GetCostAndUsageCommandInput,
  GroupDefinitionType
} from "@aws-sdk/client-cost-explorer";
import {CostEntry} from "./util/CostEntry";

const client = new CostExplorerClient({ region: "us-east-1" });

function getDateRange() {
  const end = new Date();
  end.setDate(end.getDate() + 1);

  const start = new Date();
  start.setDate(1);
  start.setMonth(start.getMonth() - 5);

  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0]
  };
}

export async function handler(event: any) {
  try {
    console.log(event);

    const { start, end } = getDateRange();
    const input: GetCostAndUsageCommandInput = {
      TimePeriod: {
        Start: start,
        End: end
      },
      Granularity: "MONTHLY",
      Metrics: ["UnblendedCost"],
      GroupBy: [{
        Type: GroupDefinitionType.DIMENSION,
        Key: "SERVICE"
      }],
      Filter: {
        Not: {
          Dimensions: {
            Key: "RECORD_TYPE",
            Values: ["Credit", "Refund"]
          }
        }
      }
    };

    const response = await client.send(new GetCostAndUsageCommand(input));
    const results: CostEntry[] = (response.ResultsByTime ?? []).flatMap(period =>
      (period.Groups ?? []).map(group => ({
        period: period.TimePeriod?.Start ?? "",
        service: group.Keys?.[0] ?? "",
        cost: group.Metrics?.UnblendedCost?.Amount ?? "0",
        unit: group.Metrics?.UnblendedCost?.Unit ?? "USD"
      }))
    );

    return {
      statusCode: 200,
      body: JSON.stringify(results),
      headers: {
        "Content-Type": "application/json"
      }
    };

  } catch (error: any) {
    console.error(error);
    return generateErrorResponse(500, "Internal server error");
  }
}
