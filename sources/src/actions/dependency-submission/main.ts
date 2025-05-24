import * as core from '@actions/core'
import * as setupGradle from '../../setup-gradle'
import * as gradle from '../../execution/gradle'
import * as dependencyGraph from '../../dependency-graph'

import {parseArgsStringToArgv} from 'string-argv'
import {
    BuildScanConfig,
    CacheConfig,
    DependencyGraphConfig,
    DependencyGraphOption,
    GradleExecutionConfig,
    setActionId,
    WrapperValidationConfig
} from '../../configuration'
import {saveDeprecationState} from '../../deprecation-collector'
import {handleMainActionError} from '../../errors'

/**
 * The main entry point for the action, called by Github Actions for the step.
 */
export async function run(): Promise<void> {
    try {
        setActionId('gradle/actions/dependency-submission')

        // Configure Gradle environment (Gradle User Home)
        await setupGradle.setup(new CacheConfig(), new BuildScanConfig(), new WrapperValidationConfig())

        // Capture the enabled state of dependency-graph
        const originallyEnabled = process.env['GITHUB_DEPENDENCY_GRAPH_ENABLED']

        // Configure the dependency graph submission
        const config = new DependencyGraphConfig()
        await dependencyGraph.setup(config)

        switch (config.getDependencyGraphOption()) {
            case DependencyGraphOption.Submit:
            case DependencyGraphOption.Upload:
            case DependencyGraphOption.SubmitAndUpload:
            case DependencyGraphOption.DownloadAndSubmit:
                // No execution to perform
                return
            /* this is the default behavior anyway
            case DependencyGraphOption.Disabled:
            case DependencyGraphOption.Generate:
            case DependencyGraphOption.GenerateAndSubmit:
            case DependencyGraphOption.GenerateSubmitAndUpload:
            case DependencyGraphOption.GenerateAndUpload:
                break
            */
        }

        // Only execute if arguments have been provided
        const executionConfig = new GradleExecutionConfig()
        const taskList = executionConfig.getDependencyResolutionTask()
        const additionalArgs = executionConfig.getAdditionalArguments()
        const executionArgs = `
              -Dorg.gradle.configureondemand=false
              -Dorg.gradle.dependency.verification=off
              -Dorg.gradle.unsafe.isolated-projects=false
              ${taskList}
              ${additionalArgs}
        `
        const args: string[] = parseArgsStringToArgv(executionArgs)
        await gradle.provisionAndMaybeExecute(
            executionConfig.getGradleVersion(),
            executionConfig.getBuildRootDirectory(),
            args
        )

        await dependencyGraph.complete(config)

        // Reset the enabled state of dependency graph
        core.exportVariable('GITHUB_DEPENDENCY_GRAPH_ENABLED', originallyEnabled)

        saveDeprecationState()
    } catch (error) {
        handleMainActionError(error)
    }

    // Explicit process.exit() to prevent waiting for hanging promises.
    process.exit()
}

run()
