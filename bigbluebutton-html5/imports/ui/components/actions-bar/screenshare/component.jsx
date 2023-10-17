import React, { memo, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { defineMessages, injectIntl } from 'react-intl';
import deviceInfo from '/imports/utils/deviceInfo';
import browserInfo from '/imports/utils/browserInfo';
import logger from '/imports/startup/client/logger';
import { notify } from '/imports/ui/services/notification';
import { withModalMounter } from '/imports/ui/components/common/modal/service';
import Styled from './styles';
import ScreenshareBridgeService from '/imports/api/screenshare/client/bridge/service';
import {
  shareScreen,
  screenshareHasEnded,
} from '/imports/ui/components/screenshare/service';
import { SCREENSHARING_ERRORS } from '/imports/api/screenshare/client/bridge/errors';
import Button from '/imports/ui/components/common/button/component';
import Auth from '/imports/ui/services/auth';
import Signal from './signal';
import BridgeService from '/imports/api/screenshare/client/bridge/service';

const { isMobile, isAndroid } = deviceInfo;
const { isSafari, isTabletApp } = browserInfo;

const WS_URL = Meteor.settings.public.kurento.wsUrl;
var videoSignal = null;

const propTypes = {
  intl: PropTypes.objectOf(Object).isRequired,
  enabled: PropTypes.bool.isRequired,
  amIPresenter: PropTypes.bool.isRequired,
  isVideoBroadcasting: PropTypes.bool.isRequired,
  isMeteorConnected: PropTypes.bool.isRequired,
  screenshareDataSavingSetting: PropTypes.bool.isRequired,
};

const intlMessages = defineMessages({
  desktopShareLabel: {
    id: 'app.actionsBar.actionsDropdown.desktopShareLabel',
    description: 'Desktop Share option label',
  },
  stopDesktopShareLabel: {
    id: 'app.actionsBar.actionsDropdown.stopDesktopShareLabel',
    description: 'Stop Desktop Share option label',
  },
  desktopShareDesc: {
    id: 'app.actionsBar.actionsDropdown.desktopShareDesc',
    description: 'adds context to desktop share option',
  },
  stopDesktopShareDesc: {
    id: 'app.actionsBar.actionsDropdown.stopDesktopShareDesc',
    description: 'adds context to stop desktop share option',
  },
  screenShareNotSupported: {
    id: 'app.media.screenshare.notSupported',
    descriptions: 'error message when trying share screen on unsupported browsers',
  },
  screenShareUnavailable: {
    id: 'app.media.screenshare.unavailable',
    descriptions: 'title for unavailable screen share modal',
  },
  finalError: {
    id: 'app.screenshare.screenshareFinalError',
    description: 'Screen sharing failures with no recovery procedure',
  },
  retryError: {
    id: 'app.screenshare.screenshareRetryError',
    description: 'Screen sharing failures where a retry is recommended',
  },
  retryOtherEnvError: {
    id: 'app.screenshare.screenshareRetryOtherEnvError',
    description: 'Screen sharing failures where a retry in another environment is recommended',
  },
  unsupportedEnvError: {
    id: 'app.screenshare.screenshareUnsupportedEnv',
    description: 'Screen sharing is not supported, changing browser or device is recommended',
  },
  permissionError: {
    id: 'app.screenshare.screensharePermissionError',
    description: 'Screen sharing failure due to lack of permission',
  },
  androidSSInfo: {
    id: 'app.screenshare.androidSSinfo',
    description: 'Android SS Info',
  }
});

const getErrorLocale = (errorCode) => {
  switch (errorCode) {
    // Denied getDisplayMedia permission error
    case SCREENSHARING_ERRORS.NotAllowedError.errorCode:
      return intlMessages.permissionError;
    // Browser is supposed to be supported, but a browser-related error happening.
    // Suggest retrying in another device/browser/env
    case SCREENSHARING_ERRORS.AbortError.errorCode:
    case SCREENSHARING_ERRORS.InvalidStateError.errorCode:
    case SCREENSHARING_ERRORS.OverconstrainedError.errorCode:
    case SCREENSHARING_ERRORS.TypeError.errorCode:
    case SCREENSHARING_ERRORS.NotFoundError.errorCode:
    case SCREENSHARING_ERRORS.NotReadableError.errorCode:
    case SCREENSHARING_ERRORS.PEER_NEGOTIATION_FAILED.errorCode:
    case SCREENSHARING_ERRORS.SCREENSHARE_PLAY_FAILED.errorCode:
    case SCREENSHARING_ERRORS.MEDIA_NO_AVAILABLE_CODEC.errorCode:
    case SCREENSHARING_ERRORS.MEDIA_INVALID_SDP.errorCode:
      return intlMessages.retryOtherEnvError;
    // Fatal errors where a retry isn't warranted. This probably means the server
    // is misconfigured somehow or the provider is utterly botched, so nothing
    // the end user can do besides requesting support
    case SCREENSHARING_ERRORS.SIGNALLING_TRANSPORT_CONNECTION_FAILED.errorCode:
    case SCREENSHARING_ERRORS.MEDIA_SERVER_CONNECTION_ERROR.errorCode:
    case SCREENSHARING_ERRORS.SFU_INVALID_REQUEST.errorCode:
      return intlMessages.finalError;
    // Unsupported errors
    case SCREENSHARING_ERRORS.NotSupportedError.errorCode:
      return intlMessages.unsupportedEnvError;
    // Errors that should be silent/ignored. They WILL NOT be LOGGED nor NOTIFIED via toasts.
    case SCREENSHARING_ERRORS.ENDED_WHILE_STARTING.errorCode:
      return null;
    // Fall through: everything else is an error which might be solved with a retry
    default:
      return intlMessages.retryError;
  }
};

const ScreenshareButton = ({
  intl,
  enabled,
  isVideoBroadcasting,
  amIPresenter,
  isMeteorConnected,
  screenshareDataSavingSetting,
  mountModal,
}) => {
  const [androidSSLoading, setAndroidSSLoading] = useState(false)

  useEffect(() => {
    if (isAndroid) {
      window.addEventListener('message', handleGenSDPRequest);
    }

    return () => {
      window.removeEventListener('message', handleGenSDPRequest);
      setAndroidSSLoading(false);
    };

  }, []);

  const handleGenSDPRequest = (event) => {
    console.log("HURRAH MSG RECEIVED !!!")
    try {
      const message = JSON.parse(event?.data);
      
      if(message.key == "StartWsForScreenShare") {
        if (!videoSignal) {
          let endpoint = WS_URL + '?sessionToken=' + Auth.sessionToken;
          videoSignal = new Signal({endpoint});
        }
      } else if(message.key == "StopWsForScreenShare") {
        if (videoSignal) {
          videoSignal.disconnect();
          videoSignal = null
        }
      } else if (message.key === 'sdpStartMsgForScreenShare') {
        console.log("Received SDP start msg for SS.")
        if (message?.startMsg) {
          let startMsg = message?.startMsg
          let sdpOffer = decodeURIComponent(startMsg.sdpOffer);
          message.startMsg.sdpOffer = sdpOffer
          console.log(sdpOffer);
         
          videoSignal.on('signalMessage',(msg)=>{
              switch (msg.id) {
                case 'startResponse':
                  const sdpAnswer = new RTCSessionDescription({ sdp: msg.sdpAnswer, type: 'answer' });
                  const encodedSDPAnswer = encodeURIComponent(sdpAnswer.sdp);
                  let sdpAnswerMsg = `{"method": "sdpAnswerForScreenShare", "sdpAnswer":"${encodedSDPAnswer}"}`
                  console.log(sdpAnswerMsg)
                  window.parent.ReactNativeWebView.postMessage(sdpAnswerMsg);
                  break;
                case 'iceCandidate':
                  const iceCandidateJSON = JSON.stringify(msg);
                  // Construct the message object
                  const messageObject = {
                    method: "iceCandidateForScreenShare",
                    iceCandidate: iceCandidateJSON,
                  };
                  // Stringify the message object
                  const messageJSON = JSON.stringify(messageObject);
                  window.parent.ReactNativeWebView.postMessage(messageJSON);
                  break;
                case 'playStart':
                  console.log(`playstart!!!!!!`);
                  setTimeout(()=>{
                    setAndroidSSLoading(false);
                  },1000)
                  
                default:
                  break;
              }
              return;
            }
          );
          videoSignal.send(message.startMsg)
        }
      } else if (message.key === 'onIceCandidateForScreenShare') {
        console.log("Received on iceCandidate Msg for screen share")
        videoSignal.send(message.iceMsg)
      } else if (message.key == 'stopMsgForScreenShare') {
        console.log("Received stop screen share msg");
        console.log(message.msg);
        // videoSignal.send(message.msg)
      } else if (message.key == 'enableScreenShareBtn') {
        console.log("Enable Screen Share Btn event received.")
        setAndroidSSLoading(false);
      }
    } catch (error) {
      console.log('Error handling message:', error);
    }
  }

  // This is the failure callback that will be passed to the /api/screenshare/kurento.js
  // script on the presenter's call
  const handleFailure = (error) => {
    const {
      errorCode = SCREENSHARING_ERRORS.UNKNOWN_ERROR.errorCode,
      errorMessage = error.message,
    } = error;

    const localizedError = getErrorLocale(errorCode);

    if (localizedError) {
      notify(intl.formatMessage(localizedError, { 0: errorCode }), 'error', 'desktop');
      logger.error({
        logCode: 'screenshare_failed',
        extraInfo: { errorCode, errorMessage },
      }, `Screenshare failed: ${errorMessage} (code=${errorCode})`);
    }

    screenshareHasEnded();
  };

  const renderScreenshareUnavailableModal = () => mountModal(
    <Styled.ScreenShareModal
      onRequestClose={() => mountModal(null)}
      hideBorder
      contentLabel={intl.formatMessage(intlMessages.screenShareUnavailable)}
    >
      <Styled.Title>
        {intl.formatMessage(intlMessages.screenShareUnavailable)}
      </Styled.Title>
      <p>{intl.formatMessage(intlMessages.screenShareNotSupported)}</p>
    </Styled.ScreenShareModal>,
  );

  const screenshareLabel = intlMessages.desktopShareLabel;

  const vLabel = isVideoBroadcasting
    ? intlMessages.stopDesktopShareLabel : screenshareLabel;

  const vDescr = isVideoBroadcasting
    ? intlMessages.stopDesktopShareDesc : intlMessages.desktopShareDesc;

  const shouldAllowScreensharing = enabled
    // && ( !isMobile || isTabletApp)
    && amIPresenter;

  const dataTest = isVideoBroadcasting ? 'stopScreenShare' : 'startScreenShare';

  return shouldAllowScreensharing
    ? (
      <Button
        disabled={(!isMeteorConnected && !isVideoBroadcasting) || androidSSLoading}
        icon={isVideoBroadcasting ? 'desktop' : 'desktop_off'}
        data-test={dataTest}
        label={intl.formatMessage(vLabel)}
        description={intl.formatMessage(vDescr)}
        color={isVideoBroadcasting ? 'primary' : 'default'}
        ghost={!isVideoBroadcasting}
        hideLabel
        circle
        size="lg"
        onClick={isVideoBroadcasting
          ? screenshareHasEnded
          : () => {
            if (isSafari && !ScreenshareBridgeService.HAS_DISPLAY_MEDIA) {
              renderScreenshareUnavailableModal();
            } 
            else if (isAndroid) {
              console.log("posting init screen share request.")
              setAndroidSSLoading(true);
              let msgForInitSS = {
                "method": "initializeScreenShareAndroid",
                "params": {
                  "callerName": Auth.userID,
                  "internalMeetingId": Auth.meetingID,
                  "sessionToken": Auth.sessionToken,
                  "wsUrl": WS_URL,
                  "voiceBridge":BridgeService.getConferenceBridge(),
                  "userName":Auth.fullname,
                  
                  "iceServerUrls":[
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:72.52.251.119:3478' }
                  ]
                }
              }
              window.parent.ReactNativeWebView.postMessage(JSON.stringify(msgForInitSS));
            } 
            else {
              shareScreen(amIPresenter, handleFailure);
            }
          }}
        id={isVideoBroadcasting ? 'unshare-screen-button' : 'share-screen-button'}
      />
    ) : null;
};

ScreenshareButton.propTypes = propTypes;
export default withModalMounter(injectIntl(memo(ScreenshareButton)));
