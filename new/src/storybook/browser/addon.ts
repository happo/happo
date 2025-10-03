import React, { useEffect, useState } from 'react';
import { AddonPanel } from 'storybook/internal/components';
import {
  addons,
  types,
  useChannel,
  useParameter,
  useStorybookState,
} from 'storybook/manager-api';

const ADDON_ID = 'happo';
const PANEL_ID = `${ADDON_ID}/panel`;

interface FunctionParam {
  key: string;
}

function HappoPanel() {
  const happoParams = useParameter('happo', null);
  const state = useStorybookState();
  const emit = useChannel({});
  const [functionParams, setFunctionParams] = useState<Array<FunctionParam>>([]);

  useEffect(() => {
    function listen(event: { params: Array<FunctionParam> }) {
      setFunctionParams(event.params);
    }

    addons.getChannel().on('happo/functions/params', listen);

    return () => {
      addons.getChannel().off('happo/functions/params', listen);
    };
  }, [state.storyId]);

  return React.createElement(
    'div',
    {
      style: {
        padding: 10,
        fontSize: 12,
      },
    },
    happoParams
      ? React.createElement(
          'table',
          null,
          React.createElement(
            'tbody',
            null,
            Object.keys(happoParams).map((key) => {
              const val = happoParams[key];

              return React.createElement(
                'tr',
                { key: key },
                React.createElement(
                  'td',
                  null,
                  React.createElement('code', null, `${key}:`),
                ),
                React.createElement(
                  'td',
                  null,
                  React.createElement('code', null, JSON.stringify(val)),
                ),
              );
            }),
            functionParams.map((param) => {
              return React.createElement(
                'tr',
                { key: param.key },
                React.createElement(
                  'td',
                  null,
                  React.createElement('code', null, `${param.key}:`),
                ),
                React.createElement(
                  'td',
                  null,
                  React.createElement(
                    'button',
                    {
                      onClick: () =>
                        emit('happo/functions/invoke', {
                          storyId: state.storyId,
                          funcName: param.key,
                        }),
                    },
                    'Invoke',
                  ),
                ),
              );
            }),
          ),
        )
      : React.createElement('div', null, 'No happo params for this story'),
  );
}

addons.register(ADDON_ID, () => {
  addons.add(PANEL_ID, {
    type: types.PANEL,
    title: 'Happo',
    render: ({ active }) => {
      return React.createElement(AddonPanel, {
        active: active ?? false,
        children: React.createElement(HappoPanel, null),
      });
    },
  });
});
