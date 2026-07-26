ARG ACT_BASE_IMAGE=catthehacker/ubuntu:act-latest
FROM ${ACT_BASE_IMAGE}

USER root

COPY media-runtime-packages.txt /tmp/openneko-media-runtime-packages.txt

RUN apt-get update \
    && xargs apt-get install -y < /tmp/openneko-media-runtime-packages.txt \
    && rm -f /tmp/openneko-media-runtime-packages.txt \
    && rm -rf /var/lib/apt/lists/*
