import { Construct } from 'npm:constructs';
import { Chart, ChartProps } from 'npm:cdk8s';

import { KubeConfigMap, KubeService, IntOrString, KubeServiceAccount, KubeIngress } from './imports/k8s.ts';

import { Rollout, RolloutSpecTemplateSpecContainersEnv } from './imports/argo-rollouts-argoproj.io.ts';

interface ServiceInfo {
  department: string;
  slackChannel: string;
}

interface ConfigProps extends ChartProps {
  name: string;
  command: string;
  port: number;
  roleArn: string;
  env: "development" | "qa" | "production"
  hostname: string;
  argoProject: string;
  serviceInfo: ServiceInfo;
}

const DD_ENV_MAPPINGS = new Map<string, string>([
  ["DD_AGENT_HOST", "status.hostIP"],
  ["DD_ENV", "metadata.labels['example.com/env']"],
  ["DD_REQUESTS_SERVICE", "metadata.labels['example.com/service']"],
  ["DD_SERVICE", "metadata.labels['example.com/service']"],]
)

const env: RolloutSpecTemplateSpecContainersEnv[] = []

DD_ENV_MAPPINGS.forEach((value, key) => {
  env.push({
    name: key,
    valueFrom: {
      fieldRef: {
        fieldPath: value
      }
    }
  })
});

function filterConstructByObject<T>(scope: Construct, obj: any): T[] {
  return scope.node.findAll().filter(o => o.node instanceof obj) as any[]
}

function applyLabelsToObjectMetadata(scope: Construct, obj: any, labels: any) {
  const tmp = filterConstructByObject<KubeIngress>(scope, obj)
  tmp.forEach(item => {
    const newobj = new Map(Object.entries(labels))
    Object.keys(labels).forEach(key => {
      item.metadata.addLabel(key, newobj.get(key) as string)
    })
  })
}

export class MyChart extends Chart {
  constructor(scope: Construct, id: string, props: ConfigProps) {
    super(scope, id, props);

    const commonMetadata = {
      name: props.name
    }
    const commonLabels = {
      "example.com/service": props.name,
      "example.com/department": props.serviceInfo.department,
      "example.com/slack-channel": props.serviceInfo.slackChannel
    }

    const albAnnotations = {
      "alb.ingress.kubernetes.io/group.name": props.argoProject,
      "alb.ingress.kubernetes.io/target-type": "ip",
      "alb.ingress.kubernetes.io/listen-ports": '[{"HTTP": 80}, {"HTTPS": 443}]',
      "alb.ingress.kubernetes.io/ssl-redirect": "443",
      "alb.ingress.kubernetes.io/healthcheck-path": "/api/v1/health",
      "alb.ingress.kubernetes.io/scheme": "internal",
      "alb.ingress.kubernetes.io/target-group-attributes": "deregistration_delay.timeout_seconds=30"
    }

    const configMap = new KubeConfigMap(this, "vars", {
      data: {
        "test": "asd"
      }
    })

    const service = new KubeService(this, "service", {
      metadata: {
        name: props.name
      },
      spec: {
        ports: [
          {
            name: "app-traffic",
            protocol: "TCP",
            port: props.port,
            targetPort: IntOrString.fromNumber(props.port)
          }
        ],
        type: "NodePort",
        selector: commonMetadata
      }
    })

    const previewService = new KubeService(this, "preview-service", {
      metadata: {
        name: `${props.name}-preview`
      },
      spec: {
        ports: [
          {
            name: "app-traffic",
            protocol: "TCP",
            port: props.port,
            targetPort: IntOrString.fromNumber(props.port)
          }
        ],
        type: "NodePort",
        selector: commonMetadata
      }
    })

    const serviceAccount = new KubeServiceAccount(this, "service-account", {
      metadata: {
        name: props.name,
        annotations: {
          "eks.amazonaws.com/role-arn": props.roleArn
        }
      }
    })

    new KubeIngress(this, "ingress", {
      metadata: {
        name: props.name,
        annotations: albAnnotations
      },
      spec: {
        ingressClassName: "alb",
        rules: [
          {
            host: props.hostname,
            http: {
              paths: [
                {
                  pathType: "Prefix",
                  path: "/",
                  backend: {
                    service: {
                      name: props.name,
                      port: {
                        number: props.port
                      }
                    }
                  }
                }
              ]
            }
          }
        ]
      }
    })

    new KubeIngress(this, "ingress-preview", {
      metadata: {
        name: `${props.name}-preview`,
        annotations: albAnnotations
      },
      spec: {
        ingressClassName: "alb",
        rules: [
          {
            host: props.hostname,
            http: {
              paths: [
                {
                  pathType: "Prefix",
                  path: "/",
                  backend: {
                    service: {
                      name: `${props.name}-preview`,
                      port: {
                        number: props.port
                      }
                    }
                  }
                }
              ]
            }
          }
        ]
      }
    })

    new Rollout(this, "web", {
      metadata: {
        name: props.name
      },
      spec: {
        strategy: {
          blueGreen: {
            activeService: service.name,
            previewService: previewService.name,
            autoPromotionEnabled: true,
            scaleDownDelaySeconds: 60
          }
        },
        template: {
          metadata: {
            labels: {
              name: props.name
            }
          },
          spec: {
            containers: [
              {
                name: props.name,
                command: [props.command],
                env: env,
                envFrom: [{ configMapRef: { name: configMap.name } }],
                ports: [{ containerPort: props.port }]
              }
            ],
            serviceAccountName: serviceAccount.name,
            volumes: [],
          }
        }
      }
    })

    applyLabelsToObjectMetadata(this, KubeIngress, commonLabels)

  }
}
