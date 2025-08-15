import * as amplify from '@aws-cdk/aws-amplify-alpha';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
//import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import path = require('path');

export class AmplifyChatuiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // -------------------------------------------------------------------------
    // Load SSM parameter that stores the Lambda function name

    const cognito_user_pool_id_parameter = ssm.StringParameter.valueForStringParameter(
      this, "/AgenticLLMAssistantWorkshop/cognito_user_pool_id"
    );

    const cognito_user_pool_client_id_parameter = ssm.StringParameter.valueForStringParameter(
      this, "/AgenticLLMAssistantWorkshop/cognito_user_pool_client_id"
    );

    // SSM parameter holding Rest API URL
    const agent_api_parameter = ssm.StringParameter.valueForStringParameter(
      this, "/AgenticLLMAssistantWorkshop/agent_api"
    );

    // -------------------------------------------------------------------------
    // Create an IAM role for Amplify to use during builds
    const amplifyBuildRole = new iam.Role(this, 'AmplifyBuildRole', {
      assumedBy: new iam.ServicePrincipal('amplify.amazonaws.com'),
      description: 'Role for Amplify to use during builds',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess-Amplify')
      ]
    });

    // Grant the Amplify role access to the GitHub token in Secrets Manager
    amplifyBuildRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['secretsmanager:GetSecretValue'],
      resources: [`arn:aws:secretsmanager:${this.region}:${this.account}:secret:amplify/pat*`]
    }));

    // Grant access to SSM parameters
    amplifyBuildRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['ssm:GetParameter', 'ssm:GetParameters'],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/AgenticLLMAssistantWorkshop/*`
      ]
    }));

    // Use GitHub as the source code provider
    const amplifyChatUI = new amplify.App(this, 'AmplifyNextJsChatUI', {
      appName: 'AmplifyNextJsChatUI',
      autoBranchDeletion: true,
      role: amplifyBuildRole,
      sourceCodeProvider: new amplify.GitHubSourceCodeProvider({
        owner: 'Masterpitan',
        repository: 'llm-assistant-project',
        oauthToken: cdk.SecretValue.secretsManager('amplify/pat')
      }),
      // Specify the subdirectory that contains the Next.js application
      buildSpec: codebuild.BuildSpec.fromObjectToYaml({
        version: '1.0',
        frontend: {
          phases: {
            preBuild: {
              commands: [
                'cd frontend/chat-app',
                'npm ci'
              ]
            },
            build: {
              commands: [
                'npm run build'
              ]
            }
          },
          artifacts: {
            baseDirectory: 'frontend/chat-app/.next',
            files: [
              '**/*'
            ]
          },
          cache: {
            paths: [
              'frontend/chat-app/node_modules/**/*'
            ]
          }
        }
      }),
      // enable server side rendering
      platform: amplify.Platform.WEB_COMPUTE,
      // https://docs.aws.amazon.com/amplify/latest/userguide/environment-variables.html#amplify-console-environment-variables
      environmentVariables: {
        // the following custom image is used to support Next.js 14, see links for details:
        // 1. https://aws.amazon.com/blogs/mobile/6-new-aws-amplify-launches-to-make-frontend-development-easier/
        // 2. https://github.com/aws-cloudformation/cloudformation-coverage-roadmap/issues/1299
        '_CUSTOM_IMAGE': 'amplify:al2023',
        'AMPLIFY_USERPOOL_ID': cognito_user_pool_id_parameter,
        'COGNITO_USERPOOL_CLIENT_ID': cognito_user_pool_client_id_parameter,
        'API_ENDPOINT': agent_api_parameter
      }
    });

    amplifyChatUI.addBranch('main', {stage: "PRODUCTION"});

    // -----------------------------------------------------------------------
    // stack outputs

    new cdk.CfnOutput(this, "AmplifyAppURL", {
      value: amplifyChatUI.defaultDomain,
    });

  }
}
