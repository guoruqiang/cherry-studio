import { GithubOutlined } from '@ant-design/icons'
import IndicatorLight from '@renderer/components/IndicatorLight'
import { HStack } from '@renderer/components/Layout'
import { APP_NAME, AppLogo } from '@renderer/config/env'
import { useTheme } from '@renderer/context/ThemeProvider'
import { useRuntime } from '@renderer/hooks/useRuntime'
import { compareVersions, runAsyncFunction } from '@renderer/utils'
import { Avatar, Progress, Row, Tag } from 'antd'
import { FC, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Markdown from 'react-markdown'
import { Link } from 'react-router-dom'
import styled from 'styled-components'

import { SettingContainer, SettingDivider, SettingGroup, SettingRow, SettingTitle } from '.'

const AboutSettings: FC = () => {
  const [version, setVersion] = useState('')
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { update } = useRuntime()

  const onOpenWebsite = (url: string) => {
    window.api.openWebsite(url)
  }

  const hasNewVersion = update?.info?.version && version ? compareVersions(update.info.version, version) > 0 : false

  const currentChannelByVersion =

  const handleTestChannelChange = async (value: UpgradeChannel) => {
    if (testPlan && currentChannelByVersion !== UpgradeChannel.LATEST && value !== currentChannelByVersion) {
      window.message.warning(t('settings.general.test_plan.version_channel_not_match'))
    }
    setTestChannel(value)
    // Clear update info when switching upgrade channel
    dispatch(
      setUpdateState({
        available: false,
        info: null,
        downloaded: false,
        checking: false,
        downloading: false,
        downloadProgress: 0
      })
    )
  }

  // Get available test version options based on current version
  const getAvailableTestChannels = () => {
    return [
      {
        tooltip: t('settings.general.test_plan.rc_version_tooltip'),
        label: t('settings.general.test_plan.rc_version'),
        value: UpgradeChannel.RC
      },
      {
        tooltip: t('settings.general.test_plan.beta_version_tooltip'),
        label: t('settings.general.test_plan.beta_version'),
        value: UpgradeChannel.BETA
      }
    ]
  }

  const handleSetTestPlan = (value: boolean) => {
    setTestPlan(value)
    dispatch(
      setUpdateState({
        available: false,
        info: null,
        downloaded: false,
        checking: false,
        downloading: false,
        downloadProgress: 0
      })
    )

    if (value === true) {
      setTestChannel(getTestChannel())
    }
  }

  const getTestChannel = () => {
    if (testChannel === UpgradeChannel.LATEST) {
      return UpgradeChannel.RC
    }
    return testChannel
  }

  useEffect(() => {
    runAsyncFunction(async () => {
      const appInfo = await window.api.getAppInfo()
      setVersion(appInfo.version)
    })
    setAutoCheckUpdate(autoCheckUpdate)
  }, [autoCheckUpdate, setAutoCheckUpdate])

  const onOpenDocs = () => {
    const isChinese = i18n.language.startsWith('zh')
    window.api.openWebsite(
      isChinese ? 'https://docs.cherry-ai.com/' : 'https://docs.cherry-ai.com/cherry-studio-wen-dang/en-us'
    )
  }

  return (
    <SettingContainer theme={theme}>
      <SettingGroup theme={theme}>
        <SettingTitle>
          {t('settings.about.title')}
          <HStack alignItems="center">
            <Link to="https://github.com/CherryHQ/cherry-studio">
              <GithubOutlined style={{ marginRight: 4, color: 'var(--color-text)', fontSize: 20 }} />
            </Link>
          </HStack>
        </SettingTitle>
        <SettingDivider />
        <AboutHeader>
          <Row align="middle">
            <AvatarWrapper onClick={() => onOpenWebsite('https://github.com/CherryHQ/cherry-studio')}>
              {update.downloadProgress > 0 && (
                <ProgressCircle
                  type="circle"
                  size={84}
                  percent={update.downloadProgress}
                  showInfo={false}
                  strokeLinecap="butt"
                  strokeColor="#67ad5b"
                />
              )}
              <Avatar src={AppLogo} size={80} style={{ minHeight: 80 }} />
            </AvatarWrapper>
            <VersionWrapper>
              <Title>{APP_NAME}</Title>
              <Description>{t('settings.about.description')}</Description>
              <Tag
                onClick={() => onOpenWebsite('https://github.com/CherryHQ/cherry-studio/releases')}
                color="cyan"
                style={{ marginTop: 8, cursor: 'pointer' }}>
                v{version}
              </Tag>
            </VersionWrapper>
          </Row>
        </AboutHeader>
      </SettingGroup>
      {hasNewVersion && update.info && (
        <SettingGroup theme={theme}>
          <SettingRow>
            <SettingRowTitle>
              {t('settings.about.updateAvailable', { version: update.info.version })}
              <IndicatorLight color="green" />
            </SettingRowTitle>
          </SettingRow>
          <UpdateNotesWrapper>
            <Markdown>
              {typeof update.info.releaseNotes === 'string'
                ? update.info.releaseNotes.replace(/\n/g, '\n\n')
                : update.info.releaseNotes?.map((note) => note.note).join('\n')}
            </Markdown>
          </UpdateNotesWrapper>
        </SettingGroup>
      )}
    </SettingContainer>
  )
}

const AboutHeader = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 5px 0;
`

const VersionWrapper = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 80px;
  justify-content: center;
  align-items: flex-start;
`

const Title = styled.div`
  font-size: 20px;
  font-weight: bold;
  color: var(--color-text-1);
  margin-bottom: 5px;
`

const Description = styled.div`
  font-size: 14px;
  color: var(--color-text-2);
  text-align: center;
`

const AvatarWrapper = styled.div`
  position: relative;
  cursor: pointer;
  margin-right: 15px;
`

const ProgressCircle = styled(Progress)`
  position: absolute;
  top: -2px;
  left: -2px;
`

export const SettingRowTitle = styled.div`
  font-size: 14px;
  line-height: 18px;
  color: var(--color-text-1);
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  .anticon {
    font-size: 16px;
    color: var(--color-text-1);
  }
`

const UpdateNotesWrapper = styled.div`
  padding: 12px 0;
  margin: 8px 0;
  background-color: var(--color-bg-2);
  border-radius: 6px;

  p {
    margin: 0;
    color: var(--color-text-2);
    font-size: 14px;
  }
`

export default AboutSettings
