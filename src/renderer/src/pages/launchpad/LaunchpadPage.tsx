import { OpenClawIcon } from '@renderer/components/Icons/SVGIcon'
import { Code, FileSearch, Folder, Languages, NotepadText, Sparkle } from 'lucide-react'
import type { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'

const LaunchpadPage: FC = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const appMenuItems = [
    {
      icon: <FileSearch size={32} className="icon" />,
      text: t('title.knowledge'),
      path: '/knowledge',
      bgColor: 'linear-gradient(135deg, #10B981, #34D399)'
    },
    {
      icon: <Sparkle size={32} className="icon" />,
      text: t('title.store'),
      path: '/store',
      bgColor: 'linear-gradient(135deg, #6366F1, #4F46E5)'
    },
    {
      icon: <Languages size={32} className="icon" />,
      text: t('title.translate'),
      path: '/translate',
      bgColor: 'linear-gradient(135deg, #06B6D4, #0EA5E9)'
    },
    {
      icon: <Folder size={32} className="icon" />,
      text: t('title.files'),
      path: '/files',
      bgColor: 'linear-gradient(135deg, #F59E0B, #FBBF24)'
    },
    {
      icon: <Code size={32} className="icon" />,
      text: t('title.code'),
      path: '/code',
      bgColor: 'linear-gradient(135deg, #1F2937, #374151)'
    },
    {
      icon: <OpenClawIcon className="icon" />,
      text: t('title.openclaw'),
      path: '/openclaw',
      bgColor: 'linear-gradient(135deg, #EF4444, #B91C1C)'
    },
    {
      icon: <NotepadText size={32} className="icon" />,
      text: t('title.notes'),
      path: '/notes',
      bgColor: 'linear-gradient(135deg, #F97316, #FB923C)'
    }
  ]

  return (
    <Container>
      <Content>
        <Section>
          <SectionTitle>{t('launchpad.apps')}</SectionTitle>
          <Grid>
            {appMenuItems.map((item) => (
              <AppIcon key={item.path} onClick={() => navigate(item.path)}>
                <IconContainer>
                  <IconWrapper bgColor={item.bgColor}>{item.icon}</IconWrapper>
                </IconContainer>
                <AppName>{item.text}</AppName>
              </AppIcon>
            ))}
          </Grid>
        </Section>
      </Content>
    </Container>
  )
}

const Container = styled.div`
  width: 100%;
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  background-color: var(--color-background);
  overflow-y: auto;
  padding: 50px 0;
`

const Content = styled.div`
  max-width: 720px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
`

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const SectionTitle = styled.h2`
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  opacity: 0.8;
  margin: 0;
  padding: 0 36px;
`

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
  padding: 0 8px;
`

const AppIcon = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  gap: 4px;
  padding: 8px 4px;
  border-radius: 16px;
  transition: transform 0.2s ease;

  &:hover {
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }
`

const IconContainer = styled.div`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 56px;
  height: 56px;
`

const IconWrapper = styled.div<{ bgColor: string }>`
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: ${(props) => props.bgColor};
  display: flex;
  justify-content: center;
  align-items: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

  .icon {
    color: white;
    width: 28px;
    height: 28px;
  }
`

const AppName = styled.div`
  font-size: 12px;
  color: var(--color-text);
  text-align: center;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export default LaunchpadPage
