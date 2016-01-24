'use strict';
angular.module('ngAudio', [])
  .directive('ngAudio', ['$compile', '$q', 'ngAudio', function ($compile, $q, ngAudio) {
    return {
      restrict: 'AEC',
      scope: {
        volume: '=',
        start: '=',
        currentTime: '=',
        loop: '=',
        clickPlay: '=',
        disablePreload: '='
        //ngAudio:'='
      },
      controller: ['$scope', '$attrs', '$element', '$timeout', function ($scope, $attrs, $element, $timeout) {

        /* Loads the sound from destination */
        var audio;

        function initSound() {
          audio = ngAudio.load($attrs.ngAudio, $scope);
          /* Add audio to local scope for modification with nested inputs */
          $scope.$audio = audio;

          /* Remove watching features for improved performance */
          audio.unbind();
        }

        if (!$scope.disablePreload) {
          initSound();
        }


        $element.on('click', function () {
          if ($scope.clickPlay === false) {
            return;
          }

          if ($scope.disablePreload) {
            initSound();
          }

          /* iOS workaround: Call the play method directly in listener function */
          audio.audio.play();

          /* Set volume to $scope volume if it exists, or default to audio's current value */
          audio.volume = $scope.volume || audio.volume;
          audio.loop = $scope.loop;
          audio.currentTime = $scope.start || 0;

          /* Fixes a bug with Firefox (???) */
          $timeout(function () {
            audio.play();
          }, 5);
        });

        $element.on('$destroy', function () {
          audio.destroy();
        });
      }]
    };
  }])

  .directive('ngAudioHover', ['$compile', '$q', 'ngAudio', function ($compile, $q, ngAudio) {
    return {
      restrict: 'AEC',
      controller: ['$scope', '$attrs', '$element', '$timeout', function ($scope, $attrs, $element, $timeout) {

        var audio = ngAudio.load($attrs.ngAudioHover, $scope);

        $element.on('mouseover rollover hover', function () {

          /* iOS workaround: Call the play method directly in listener function */
          audio.audio.play();

          audio.volume = $attrs.volumeHover || audio.volume;
          audio.loop = $attrs.loop;
          audio.currentTime = $attrs.startHover || 0;

        });

        $element.on('$destroy', function () {
          audio.destroy();
        });
      }]
    };
  }])

  .service('localAudioFindingService', ['$q', function ($q) {

    this.find = function (id) {
      var deferred = $q.defer();
      var $sound = document.getElementById(id);
      if ($sound) {
        deferred.resolve($sound);
      } else {
        deferred.reject(id);
      }

      return deferred.promise;
    };
  }])

  .service('remoteAudioFindingService', ['$q', function ($q) {

    this.find = function (url) {
      var deferred = $q.defer();
      var audio = new Audio();

      audio.addEventListener('error', function () {
        deferred.reject();
      });

      audio.addEventListener('loadstart', function () {
        deferred.resolve(audio);
      });

      // bugfix for chrome...
      setTimeout(function () {
        audio.src = url;
      }, 1);

      return deferred.promise;

    };
  }])

  .service('cleverAudioFindingService', ['$q', 'localAudioFindingService', 'remoteAudioFindingService', function ($q, localAudioFindingService, remoteAudioFindingService) {
    this.find = function (id) {
      var deferred = $q.defer();

      id = id.replace('|', '/');

      localAudioFindingService.find(id)
        .then(deferred.resolve, function () {
          return remoteAudioFindingService.find(id);
        })
        .then(deferred.resolve, deferred.reject);

      return deferred.promise;
    };
  }])

  .value('ngAudioGlobals', {
    muting: false,
    performance: 25,
    unlock: true,
    volume: 1,
    listeners: [],
    listen: function(cb) {
      this.listeners.push(cb);
    },
    callListeners: function() {
      for(var i in this.listeners) {
        this.listeners[i](this);
      }
    }
  })

  .factory('NgAudioObject', ['cleverAudioFindingService', '$timeout', 'ngAudioGlobals', function (cleverAudioFindingService, $timeout, ngAudioGlobals) {
    return function (id, scope) {

      function twiddle() {
        audio.play();
        audio.pause();
        window.removeEventListener("click", twiddle);
      }

      var $audioWatch,
        $willPlay = false,
        $willPause = false,
        $willRestart = false,
        $willChangePlaybackRate = false,
        $newPlaybackRate = false,
        $volumeToSet = ngAudioGlobals.volume,
        $looping,
        $muting = false,
        $observeProperties = true,
        $destroyed = false,
        $scope = scope,
        $updating = false,
        audio,
        audioObject = this;

      this.id = id;
      this.safeId = id.replace('/', '|');
      this.loop = 0;

      this.unbind = function () {
        $observeProperties = false;
      };

      this.play = function () {
        $willPlay = true;
        return this;
      };

      var completeListeners = [];
      this.complete = function (callback) {
        completeListeners.push(callback);
      };

      this.pause = function () {
        $willPause = true;
      };

      this.restart = function () {
        $willRestart = true;
      };

      this.stop = function () {
        this.restart();
      };

      this.setVolume = function (volume) {
        $volumeToSet = volume;
      };

      this.setPlaybackRate = function (rate) {
        $newPlaybackRate = rate;
        $willChangePlaybackRate = true;
      };

      this.setMuting = function (muting) {
        $muting = muting;
      };

      this.setProgress = function (progress) {
        if (audio && audio.duration && isFinite(progress)) {
          audio.currentTime = audio.duration * progress;
        }
      };

      this.setCurrentTime = function (currentTime) {
        if (audio && audio.duration) {
          audio.currentTime = currentTime;
        }
      };

      this.destroy = $destroy;

      $scope.$on('$destroy', function () {
        $destroy();
      });

      function $destroy() {
        if (!$destroyed) {
          if ($audioWatch) {
            $audioWatch();
          }
          $destroyed = true;
        }
      }

      ngAudioGlobals.listen(function(ngAudioGlobals) {
        if (ngAudioGlobals.muting) {
          audioObject.setMuting(true);
        } else {
          audioObject.setMuting(false);
        }
        checkWatchers();
      });

      $audioWatch = $scope.$watch(function () {
        return {
          volume: audioObject.volume,
          currentTime: audioObject.currentTime,
          progress: audioObject.progress,
          muting: audioObject.muting,
          loop: audioObject.loop,
          playbackRate: audioObject.playbackRate
        };
      }, function (newValue, oldValue) {
        if($updating) {
          return;
        }

        if (newValue.currentTime !== oldValue.currentTime) {
          audioObject.setCurrentTime(newValue.currentTime);
        }

        if (newValue.progress !== oldValue.progress) {
          audioObject.setProgress(newValue.progress);
        }
        if (newValue.volume !== oldValue.volume) {
          audioObject.setVolume(newValue.volume);
        }

        if (newValue.playbackRate !== oldValue.playbackRate) {
          audioObject.setPlaybackRate(newValue.playbackRate);
        }

        $looping = newValue.loop;

        if (newValue.muting !== oldValue.muting) {
          audioObject.setMuting(newValue.muting);
        }

        if (ngAudioGlobals.volume === 0 || ngAudioGlobals.muting) {
          audioObject.setMuting(true);
        } else {
          audioObject.setMuting(false);
          audioObject.setVolume(ngAudioGlobals.volume);
        }
      }, true);

      cleverAudioFindingService.find(id)
        .then(function (nativeAudio) {
          audio = nativeAudio;
          if (ngAudioGlobals.unlock) {

            window.addEventListener("click", twiddle);

            audio.addEventListener('playing', function () {
              window.removeEventListener("click", twiddle);
              checkWatchers();
            });

            audio.addEventListener("timeupdate", function() {
              if($observeProperties) {
                checkWatchers();
              }
            });
          }

          audio.addEventListener('canplay', function () {
            audioObject.canPlay = true;
            checkWatchers();
          });

        }, function (error) {
          audioObject.error = true;
          console.warn(error);
        });

      function checkWatchers() {
        if (audio) {
          if ($muting || ngAudioGlobals.muting) {
            audio.volume = 0;
          } else {
            audio.volume = audioObject.volume !== undefined ? audioObject.volume : 1;
          }

          if ($willPlay) {
            audio.play();
            $willPlay = false;
          }

          if ($willRestart) {
            audio.src = 'about:blank';
            $willRestart = false;
          }

          if ($willPause) {
            audio.pause();
            $willPause = false;
          }

          if ($willChangePlaybackRate) {
            audio.playbackRate = $newPlaybackRate;
            $willChangePlaybackRate = false;
          }

          if ($volumeToSet) {
            audio.volume = $volumeToSet;
            $volumeToSet = undefined;
          }

          if ($observeProperties) {
            audioObject.currentTime = audio.currentTime;
            audioObject.duration = audio.duration;
            audioObject.remaining = audio.duration - audio.currentTime;
            audioObject.progress = 0; //We set initial value to 0
            audioObject.paused = audio.paused;
            audioObject.src = audio.src;

            //After we check if progress is bigger than 0, and we set
            var tempProgress = (audio.currentTime / audio.duration);
            if (tempProgress > 0) {
              audioObject.progress = tempProgress;
            }

            if (audioObject.currentTime >= audioObject.duration) {
              completeListeners.forEach(function (listener) {
                listener(audioObject);
              })
            }

            if ($looping && audioObject.currentTime >= audioObject.duration) {
              if ($looping !== true) {
                $looping--;
                audioObject.loop--;
                // if (!$looping) return;
              }
              audioObject.setCurrentTime(0);
              audioObject.play();
            }
            if(!$scope.$$phase) {
              $updating = true;
              $scope.$digest();
              $updating = false;
            }
          }

          if (!$muting && !ngAudioGlobals.muting) {
            audioObject.volume = audio.volume;
          }

          audioObject.audio = audio;
        }
      }
    };
  }])
  .service('ngAudio', ['NgAudioObject', 'ngAudioGlobals', '$rootScope', function (NgAudioObject, ngAudioGlobals, $rootScope) {
    this.play = function (id, scope) {
      if(scope == undefined) {
        scope = $rootScope.$new();
      }
      var audio = new NgAudioObject(id, scope);
      audio.play();
      return audio;
    };

    this.load = function (id, scope) {
      if(scope == undefined) {
        scope = $rootScope.$new();
      }
      return new NgAudioObject(id, scope);
    };

    this.mute = function () {
      ngAudioGlobals.muting = true;
      ngAudioGlobals.callListeners();
    };

    this.unmute = function () {
      ngAudioGlobals.muting = false;
      ngAudioGlobals.callListeners();
    };

    this.toggleMute = function () {
      ngAudioGlobals.muting = !ngAudioGlobals.muting;
      ngAudioGlobals.callListeners();
    };

    this.setUnlock = function (unlock) {
      ngAudioGlobals.unlock = unlock;
      ngAudioGlobals.callListeners();
    };

    this.setGlobalVolume = function (globalVolume) {
      ngAudioGlobals.volume = globalVolume;
      ngAudioGlobals.callListeners();
    };
  }])
  .filter("trackTime", function () {
    /* Conveniently takes a number and returns the track time */

    return function (input) {

      var totalSec = Math.floor(input | 0);

      var output = "";
      var hours = 0;
      var minutes = 0;
      var seconds = 0;

      if (totalSec > 3599) {

        hours = Math.floor(totalSec / 3600);
        minutes = Math.floor((totalSec - (hours * 3600)) / 60);
        seconds = (totalSec - ((minutes * 60) + (hours * 3600)));

        if (hours.toString().length == 1) {
          hours = "0" + (Math.floor(totalSec / 3600)).toString();
        }

        if (minutes.toString().length == 1) {
          minutes = "0" + (Math.floor((totalSec - (hours * 3600)) / 60)).toString();
        }

        if (seconds.toString().length == 1) {
          seconds = "0" + (totalSec - ((minutes * 60) + (hours * 3600))).toString();
        }

        output = hours + ":" + minutes + ":" + seconds;

      } else if (totalSec > 59) {

        minutes = Math.floor(totalSec / 60);
        seconds = totalSec - (minutes * 60);

        if (minutes.toString().length == 1) {
          minutes = "0" + (Math.floor(totalSec / 60)).toString();
        }

        if (seconds.toString().length == 1) {
          seconds = "0" + (totalSec - (minutes * 60)).toString();
        }

        output = minutes + ":" + seconds;

      } else {

        seconds = totalSec;

        if (seconds.toString().length == 1) {
          seconds = "0" + (totalSec).toString();
        }

        output = totalSec + "s";

      }

      if (typeof Number.isNaN === "function" && Number.isNaN(output)) {
        debugger;
      }

      return output;
    }
  });
