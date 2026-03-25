describe('happo spec', () => {
  it('passes', () => {
    cy.visit(`http://localhost:${Cypress.env('SERVER_PORT')}/index.html`);

    cy.get('main').happoScreenshot({
      component: 'main',
      variant: 'default',
    });

    // autoApplyPseudoStateAttributes: hover detected via mouseover event tracking
    // (cy.trigger fires the event; querySelectorAll(':hover') isn't updated by it).
    cy.get('button').first().trigger('mouseover');
    cy.get('button').first().happoScreenshot({
      component: 'button',
      variant: 'hover',
    });
    cy.get('button').first().trigger('mouseout');

    // autoApplyPseudoStateAttributes: active detected via mousedown event tracking.
    cy.get('button').first().trigger('mousedown');
    cy.get('button').first().happoScreenshot({
      component: 'button',
      variant: 'active',
    });
    cy.get('button').first().trigger('mouseup');

    // autoApplyPseudoStateAttributes detects focus automatically; focus-visible is
    // also applied because keyboard-equivalent focus triggers :focus-visible.
    cy.get('button').first().focus();
    cy.get('button').first().happoScreenshot({
      component: 'button',
      variant: 'focus and focus-visible',
    });
    cy.get('button').first().blur();

    cy.get('h1').happoScreenshot({
      component: 'h1',
      variant: 'default',
    });

    cy.get('button').happoScreenshot({
      component: 'button',
      variant: 'single element',
    });

    cy.get('button').happoScreenshot({
      component: 'button',
      variant: 'multiple elements',
      includeAllElements: true,
    });

    cy.get('canvas').happoScreenshot({
      component: 'canvas',
      variant: 'default',
    });

    cy.get('p').happoScreenshot();
  });
});
