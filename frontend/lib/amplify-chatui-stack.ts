import * as amplify from '@aws-cdk/aws-amplify-alpha';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
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

    // Use GitHub as the source code provider
    const amplifyChatUI = new amplify.App(this, 'AmplifyNextJsChatUI', {
      appName: 'AmplifyNextJsChatUI',  // Explicitly set the app name
      autoBranchDeletion: true,
      sourceCodeProvider: new amplify.GitHubSourceCodeProvider({
        owner: 'Masterpitan', // Your GitHub username
        repository: 'llm-assistant-project', // Your GitHub repository name
        oauthToken: cdk.SecretValue.secretsManager('llm/amplify') // Use token stored in AWS Secrets Manager
      }),
      // enable server side rendering
      platform: amplify.Platform.WEB_COMPUTE,
      // Specify the buildSpec with improved directory handling
      buildSpec: cdk.aws_codebuild.BuildSpec.fromObjectToYaml({
        version: '1.0',
        frontend: {
          phases: {
            preBuild: {
              commands: [
                'echo "Current directory: $(pwd)"',
                'ls -la',  // List files to debug
                'cd frontend/chat-app || cd chat-app || echo "Directory not found"',
                'echo "Now in: $(pwd)"',
                'ls -la',  // List files again after changing directory
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
            baseDirectory: '.next',  // Relative to where build commands run
            files: [
              '**/*'
            ]
          },
          cache: {
            paths: [
              'node_modules/**/*'
            ]
          }
        }
      }),
      // https://docs.aws.amazon.com/amplify/latest/userguide/environment-variables.html#amplify-console-environment-variables
      environmentVariables: {
        // the following custom image is used to support Next.js 14, see links for details:
        // 1. https://aws.amazon.com/blogs/mobile/6-new-aws-amplify-launches-to-make-frontend-development-easier/
        // 2. https://github.com/aws-cloudformation/cloudformation-coverage-roadmap/issues/1299
        '_CUSTOM_IMAGE': 'amplify:al2023',
        'NEXT_PUBLIC_AMPLIFY_USERPOOL_ID': cognito_user_pool_id_parameter,
        'NEXT_PUBLIC_COGNITO_USERPOOL_CLIENT_ID': cognito_user_pool_client_id_parameter,
        'NEXT_PUBLIC_API_ENDPOINT': agent_api_parameter
      }
    });

    // Add a branch connected to the main branch of the repository
    amplifyChatUI.addBranch('main', {
      stage: "PRODUCTION"
    });

    // -----------------------------------------------------------------------
    // stack outputs

    new cdk.CfnOutput(this, "AmplifyAppURL", {
      value: amplifyChatUI.defaultDomain,
    });

    new cdk.CfnOutput(this, "AmplifyAppId", {
      value: amplifyChatUI.appId,
    });

  }
}
