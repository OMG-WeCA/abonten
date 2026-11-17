import type { MetricPoint } from './abonten-score';
import type { TravelDemandPointDto } from './dto/travel-demand-shared.dto';

export const METRES_PER_DEGREE = 111_195;

export function metricPoint(
  point: TravelDemandPointDto,
  center: TravelDemandPointDto,
): MetricPoint {
  const longitudeDelta = ((point.longitude - center.longitude + 540) % 360) - 180;
  return [
    longitudeDelta * METRES_PER_DEGREE * Math.cos((center.latitude * Math.PI) / 180),
    (point.latitude - center.latitude) * METRES_PER_DEGREE,
  ];
}
