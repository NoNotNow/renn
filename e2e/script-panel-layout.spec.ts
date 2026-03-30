import { test } from '@playwright/test'

test.describe('Script Panel Layout Investigation', () => {
  test('investigate Monaco editor layout and IntelliSense', async ({ page }) => {
    await page.goto('/')
    
    // Take initial screenshot
    await page.screenshot({ path: 'screenshots/01-initial-page.png', fullPage: true })
    
    // Find and click the Scripts tab in the right sidebar
    // Look for the button with aria-label or title "Scripts"
    const scriptsTab = page.locator('button[aria-label="Scripts"]')
    
    // Check if scripts tab exists
    const scriptsTabExists = await scriptsTab.count() > 0
    console.log('Scripts tab exists:', scriptsTabExists)
    
    if (scriptsTabExists) {
      // First, select an entity by clicking on one in the 3D scene
      // Click somewhere in the middle of the viewport to select an entity
      await page.mouse.click(500, 300)
      await page.waitForTimeout(300)
      
      await scriptsTab.click()
      await page.waitForTimeout(500) // Wait for tab switch animation
      
      // Take screenshot after clicking Scripts tab
      await page.screenshot({ path: 'screenshots/02-scripts-tab-opened.png', fullPage: true })
      
      // Find the Monaco editor container
      const editorContainer = page.locator('.script-editor-container')
      const editorExists = await editorContainer.count() > 0
      console.log('Editor container exists:', editorExists)
      
      if (editorExists) {
        // Get dimensions of the editor container
        const containerBox = await editorContainer.boundingBox()
        console.log('Editor container bounding box:', containerBox)
        
        // Get computed styles
        const containerStyles = await editorContainer.evaluate((el) => {
          const computed = window.getComputedStyle(el)
          return {
            overflow: computed.overflow,
            height: computed.height,
            minHeight: computed.minHeight,
            flex: computed.flex,
            display: computed.display,
            flexDirection: computed.flexDirection,
          }
        })
        console.log('Editor container computed styles:', containerStyles)
        
        // Wait for Monaco editor to load (it shows "Loading..." initially)
        const monacoEditor = page.locator('.monaco-editor')
        console.log('Waiting for Monaco editor to load...')
        await monacoEditor.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
          console.log('Monaco editor did not load within 10 seconds')
        })
        
        const monacoExists = await monacoEditor.count() > 0
        console.log('Monaco editor exists:', monacoExists)
        
        if (monacoExists) {
          const monacoBox = await monacoEditor.first().boundingBox()
          console.log('Monaco editor bounding box:', monacoBox)
          
          // Check if editor is cut off (compare container height vs editor height)
          if (containerBox && monacoBox) {
            const isCutOff = monacoBox.height > containerBox.height
            console.log('Is Monaco editor cut off?', isCutOff)
            console.log('Container height:', containerBox.height, 'Editor height:', monacoBox.height)
          }
        }
        
        // Look for the resize handle
        const resizeHandle = page.locator('button[title*="resize"]')
        const resizeHandleExists = await resizeHandle.count() > 0
        console.log('Resize handle exists:', resizeHandleExists)
        
        if (resizeHandleExists) {
          const handleBox = await resizeHandle.first().boundingBox()
          console.log('Resize handle bounding box:', handleBox)
          
          // Check if it's visible
          const isVisible = await resizeHandle.first().isVisible()
          console.log('Resize handle is visible:', isVisible)
          
          // Take screenshot highlighting the resize handle
          await page.screenshot({ path: 'screenshots/03-with-resize-handle.png', fullPage: true })
        }
        
        // Try to click inside the Monaco editor
        if (monacoExists) {
          const monacoTextArea = page.locator('.monaco-editor textarea').first()
          // Monaco's editable input can briefly be in a readonly/overlay state; clicking is flaky
          // and can be intercepted by Monaco's internal layers. Focus once it becomes editable.
          await page
            .waitForFunction(() => {
              const el = document.querySelector('.monaco-editor textarea') as HTMLTextAreaElement | null
              if (!el) return false
              return !el.readOnly && !el.disabled
            }, { timeout: 10000 })
            .catch(() => {})

          await monacoTextArea.evaluate((el) => {
            ;(el as HTMLTextAreaElement).focus()
          })
          await page.waitForTimeout(200)
          
          // Type something to trigger IntelliSense
          await page.keyboard.type('ctx.')
          await page.waitForTimeout(500) // Wait for IntelliSense to appear
          
          // Take screenshot with IntelliSense
          await page.screenshot({ path: 'screenshots/04-with-intellisense.png', fullPage: true })
          
          // Check if IntelliSense dropdown exists
          const intelliSense = page.locator('.monaco-editor .suggest-widget')
          const intelliSenseExists = await intelliSense.count() > 0
          console.log('IntelliSense dropdown exists:', intelliSenseExists)
          
          if (intelliSenseExists) {
            const intelliSenseBox = await intelliSense.boundingBox()
            console.log('IntelliSense dropdown bounding box:', intelliSenseBox)
            
            // Check if IntelliSense is cut off by checking if it extends beyond viewport
            const viewportSize = page.viewportSize()
            if (intelliSenseBox && viewportSize) {
              const isCutOffBottom = intelliSenseBox.y + intelliSenseBox.height > viewportSize.height
              const isCutOffRight = intelliSenseBox.x + intelliSenseBox.width > viewportSize.width
              console.log('IntelliSense cut off at bottom?', isCutOffBottom)
              console.log('IntelliSense cut off at right?', isCutOffRight)
            }
            
            // Check overflow-guard element
            const overflowGuard = page.locator('.overflow-guard')
            if (await overflowGuard.count() > 0) {
              const overflowStyle = await overflowGuard.first().evaluate((el) => {
                return window.getComputedStyle(el).overflow
              })
              console.log('overflow-guard computed overflow:', overflowStyle)
            }
          }
        }
      }
    }
    
    // Final screenshot
    await page.screenshot({ path: 'screenshots/05-final-state.png', fullPage: true })
  })
})
