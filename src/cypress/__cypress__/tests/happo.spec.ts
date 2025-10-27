describe('happo spec', () => {
  it('passes', () => {
    cy.visit(`http://localhost:${Cypress.env('SERVER_PORT')}/index.html`);
    cy.get('h1').happoScreenshot({
      component: 'h1',
      variant: 'default',
    });

    cy.get('p').happoScreenshot();
  });
});
