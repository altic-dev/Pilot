export enum MetricType {
  mean = "mean",
  funnel = "funnel",
  ratio = "ratio",
}

export enum MetricGoal {
  increase = "increase",
  decrease = "decrease",
}

export enum DefaultSource {
  pageView = "$pageview",
  pageLeave = "$pageleave",
}

export interface EventsNode {
  kind?: "EventsNode";
  name: DefaultSource;
  event: DefaultSource;
}

export interface ExperimentMetric {
  kind?: "ExperimentMetric";
  name: string;
  uuid: string;
  metric_type: MetricType;
  goal: MetricGoal;
  source: EventsNode;
}

export interface CreateExperiment {
  name: string;
  description: string;
  feature_flag_key: string;
  metrics: ExperimentMetric[];
  primary_metrics_ordered_uuids: string[];
}
