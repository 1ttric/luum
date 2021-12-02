FROM python:3
WORKDIR /app/src
COPY . .

RUN pip install -r requirements.txt

EXPOSE 3001
CMD ["python", "luum/app.py"]