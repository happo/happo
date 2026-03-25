describe('happo spec', () => {
  it('passes', () => {
    cy.visit(`http://localhost:${Cypress.env('SERVER_PORT')}/index.html`);

    cy.get('main').happoScreenshot({
      component: 'main',
      variant: 'default',
    });

    // autoApplyPseudoStateAttributes detects the focused element automatically —
    // no need to add data-happo-focus manually.
    cy.get('button').first().focus();
    cy.get('main').happoScreenshot({
      component: 'main',
      variant: 'button focused',
    });
    cy.get('button').first().blur();

    // autoApplyPseudoStateAttributes detects the hovered element automatically
    // via mouseover event tracking (cy.trigger fires the event, which the
    // tracker picks up even though querySelectorAll(':hover') isn't updated).
    cy.get('button').first().trigger('mouseover');
    cy.get('button').first().happoScreenshot({
      component: 'button',
      variant: 'hovered',
    });
    cy.get('button').first().trigger('mouseout');

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
