import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import {
  setupTerminal,
  shouldOfferTerminalSetup,
} from '../commands/terminalSetup/terminalSetup.js'
import { useExitOnCtrlCDWithKeybindings } from '../hooks/useExitOnCtrlCDWithKeybindings.js'
import { Box, Link, Newline, Text, useTheme } from '@anthropic/ink'
import { useKeybindings } from '../keybindings/useKeybinding.js'
import { isAnthropicAuthEnabled } from '../utils/auth.js'
import { normalizeApiKeyForConfig } from '../utils/authPortable.js'
import { getCustomApiKeyStatus } from '../utils/config.js'
import { env } from '../utils/env.js'
import { isRunningOnHomespace } from '../utils/envUtils.js'
import { PreflightStep } from '../utils/preflightChecks.js'
import type { ThemeSetting } from '../utils/theme.js'
import { ApproveApiKey } from './ApproveApiKey.js'
import { ConsoleOAuthFlow } from './ConsoleOAuthFlow.js'
import { Select } from './CustomSelect/select.js'
import { WelcomeV2 } from './LogoV2/WelcomeV2.js'
import { PressEnterToContinue } from './PressEnterToContinue.js'
import { ThemePicker } from './ThemePicker.js'
import { OrderedList } from './ui/OrderedList.js'

type StepId =
  | 'preflight'
  | 'theme'
  | 'oauth'
  | 'api-key'
  | 'security'
  | 'terminal-setup'

interface OnboardingStep {
  id: StepId
  component: React.ReactNode
}

type Props = {
  onDone(): void
}

export function Onboarding({ onDone }: Props): React.ReactNode {
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [skipOAuth, setSkipOAuth] = useState(false)
  const [oauthEnabled] = useState(() => isAnthropicAuthEnabled())
  const [theme, setTheme] = useTheme()

  useEffect(() => {
    logEvent('tengu_began_setup', {
      oauthEnabled,
    })
  }, [oauthEnabled])

  function goToNextStep() {
    if (currentStepIndex < steps.length - 1) {
      const nextIndex = currentStepIndex + 1
      setCurrentStepIndex(nextIndex)

      logEvent('tengu_onboarding_step', {
        oauthEnabled,
        stepId: steps[nextIndex]
          ?.id as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
    } else {
      onDone()
    }
  }

  function handleThemeSelection(newTheme: ThemeSetting) {
    setTheme(newTheme)
    goToNextStep()
  }

  const exitState = useExitOnCtrlCDWithKeybindings()

  // Define all onboarding steps
  const themeStep = (
    <Box marginX={1}>
      <ThemePicker
        onThemeSelect={handleThemeSelection}
        showIntroText={true}
        helpText="之后可通过运行 /theme 更改"
        hideEscToCancel={true}
        skipExitHandling={true} // Skip exit handling as Onboarding already handles it
      />
    </Box>
  )

  const securityStep = (
    <Box flexDirection="column" gap={1} paddingLeft={1}>
      <Text bold>安全注意事项：</Text>
      <Box flexDirection="column" width={70}>
        {/**
         * OrderedList misnumbers items when rendering conditionally,
         * so put all items in the if/else
         */}
        <OrderedList>
          <OrderedList.Item>
            <Text>Claude 可能会犯错</Text>
            <Text dimColor wrap="wrap">
              您应该始终审阅 Claude 的回复，尤其是在运行代码时。
              <Newline />
            </Text>
          </OrderedList.Item>
          <OrderedList.Item>
            <Text>
              由于提示词注入风险，请仅在信任的代码上使用
            </Text>
            <Text dimColor wrap="wrap">
              更多详情请参阅：
              <Newline />
              <Link url="https://code.claude.com/docs/en/security" />
            </Text>
          </OrderedList.Item>
        </OrderedList>
      </Box>
      <PressEnterToContinue />
    </Box>
  )

  const preflightStep = <PreflightStep onSuccess={goToNextStep} />
  // Create the steps array - determine which steps to include based on reAuth and oauthEnabled
  const apiKeyNeedingApproval = useMemo(() => {
    // Add API key step if needed
    // On homespace, ANTHROPIC_API_KEY is preserved in process.env for child
    // processes but ignored by Claude Code itself (see auth.ts).
    if (!process.env.ANTHROPIC_API_KEY || isRunningOnHomespace()) {
      return ''
    }
    const customApiKeyTruncated = normalizeApiKeyForConfig(
      process.env.ANTHROPIC_API_KEY,
    )
    if (getCustomApiKeyStatus(customApiKeyTruncated) === 'new') {
      return customApiKeyTruncated
    }
  }, [])

  function handleApiKeyDone(approved: boolean) {
    if (approved) {
      setSkipOAuth(true)
    }
    goToNextStep()
  }

  const steps: OnboardingStep[] = []
  if (oauthEnabled) {
    steps.push({ id: 'preflight', component: preflightStep })
  }
  steps.push({ id: 'theme', component: themeStep })

  if (apiKeyNeedingApproval) {
    steps.push({
      id: 'api-key',
      component: (
        <ApproveApiKey
          customApiKeyTruncated={apiKeyNeedingApproval}
          onDone={handleApiKeyDone}
        />
      ),
    })
  }

  if (oauthEnabled) {
    steps.push({
      id: 'oauth',
      component: (
        <SkippableStep skip={skipOAuth} onSkip={goToNextStep}>
          <ConsoleOAuthFlow onDone={goToNextStep} />
        </SkippableStep>
      ),
    })
  }

  steps.push({ id: 'security', component: securityStep })

  if (shouldOfferTerminalSetup()) {
    steps.push({
      id: 'terminal-setup',
      component: (
        <Box flexDirection="column" gap={1} paddingLeft={1}>
          <Text bold>使用 Claude Code 的终端设置？</Text>
          <Box flexDirection="column" width={70} gap={1}>
            <Text>
              为获得最佳编码体验，请为您的终端启用推荐设置
              <Newline />
              {env.terminal === 'Apple_Terminal'
                ? 'Option+回车换行和视觉铃声'
                : 'Shift+回车换行'}
            </Text>
            <Select
              options={[
                {
                  label: '是，使用推荐设置',
                  value: 'install',
                },
                {
                  label: '否，稍后通过 /terminal-setup 设置',
                  value: 'no',
                },
              ]}
              onChange={value => {
                if (value === 'install') {
                  // Errors already logged in setupTerminal, just swallow and proceed
                  void setupTerminal(theme)
                    .catch(() => {})
                    .finally(goToNextStep)
                } else {
                  goToNextStep()
                }
              }}
              onCancel={() => goToNextStep()}
            />
            <Text dimColor>
              {exitState.pending ? (
                <>按 {exitState.keyName} 再按一次退出</>
              ) : (
                <>回车确认 · Esc 跳过</>
              )}
            </Text>
          </Box>
        </Box>
      ),
    })
  }

  const currentStep = steps[currentStepIndex]

  // Handle Enter on security step and Escape on terminal-setup step
  // Dependencies match what goToNextStep uses internally
  const handleSecurityContinue = useCallback(() => {
    if (currentStepIndex === steps.length - 1) {
      onDone()
    } else {
      goToNextStep()
    }
  }, [currentStepIndex, steps.length, oauthEnabled, onDone])

  const handleTerminalSetupSkip = useCallback(() => {
    goToNextStep()
  }, [currentStepIndex, steps.length, oauthEnabled, onDone])

  useKeybindings(
    {
      'confirm:yes': handleSecurityContinue,
    },
    {
      context: 'Confirmation',
      isActive: currentStep?.id === 'security',
    },
  )

  useKeybindings(
    {
      'confirm:no': handleTerminalSetupSkip,
    },
    {
      context: 'Confirmation',
      isActive: currentStep?.id === 'terminal-setup',
    },
  )

  return (
    <Box flexDirection="column">
      <WelcomeV2 />
      <Box flexDirection="column" marginTop={1}>
        {currentStep?.component}
        {exitState.pending && (
          <Box padding={1}>
            <Text dimColor>按 {exitState.keyName} 再按一次退出</Text>
          </Box>
        )}
      </Box>
    </Box>
  )
}

export function SkippableStep({
  skip,
  onSkip,
  children,
}: {
  skip: boolean
  onSkip(): void
  children: React.ReactNode
}): React.ReactNode {
  useEffect(() => {
    if (skip) {
      onSkip()
    }
  }, [skip, onSkip])
  if (skip) {
    return null
  }
  return children
}
